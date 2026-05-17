const photoInput = document.querySelector("#photoInput");
const cameraInput = document.querySelector("#cameraInput");
const heightInput = document.querySelector("#heightInput");
const analyzeButton = document.querySelector("#analyzeButton");
const canvas = document.querySelector("#canvas");
const emptyState = document.querySelector("#emptyState");
const modelStatus = document.querySelector("#modelStatus");
const results = document.querySelector("#results");
const ctx = canvas.getContext("2d");

let pose;
let currentImage;
let latestLandmarks;

const landmarkIndex = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28
};

const bones = [
  ["leftShoulder", "rightShoulder"],
  ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"],
  ["leftHip", "rightHip"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"]
];

async function bootPoseModel() {
  pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  pose.onResults((results) => {
    latestLandmarks = results.poseLandmarks || null;
    drawImageAndPose();
  });

  modelStatus.textContent = "Ready";
}

photoInput.addEventListener("change", handleImageSelection);
cameraInput.addEventListener("change", handleImageSelection);

document.querySelectorAll("input[name='profile']").forEach((input) => {
  input.addEventListener("change", () => {
    if (latestLandmarks) {
      const height = Number(heightInput.value);
      if (Number.isFinite(height)) {
        showEstimates(estimateMeasurements(latestLandmarks, height));
      }
    }
  });
});

async function handleImageSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const image = new Image();
  image.onload = () => {
    currentImage = image;
    latestLandmarks = null;
    emptyState.hidden = true;
    analyzeButton.disabled = false;
    document.querySelector("#results").hidden = true;
    resizeCanvasForImage(image);
    drawImageAndPose();
  };
  image.src = URL.createObjectURL(file);
}

analyzeButton.addEventListener("click", async () => {
  if (!currentImage || !pose) return;

  const height = Number(heightInput.value);
  if (!Number.isFinite(height) || height < 36 || height > 96) {
    alert("Enter height in inches, for example 66.");
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = "Analyzing...";
  modelStatus.textContent = "Analyzing";

  await pose.send({ image: currentImage });

  if (!latestLandmarks) {
    alert("No body pose detected. Try a clearer full-body front photo.");
  } else {
    try {
      showEstimates(estimateMeasurements(latestLandmarks, height));
    } catch (error) {
      alert(error.message || "Could not estimate measurements from this photo.");
    }
  }

  analyzeButton.disabled = false;
  analyzeButton.textContent = "Estimate Measurements";
  modelStatus.textContent = "Ready";
});

function resizeCanvasForImage(image) {
  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
}

function drawImageAndPose() {
  if (!currentImage) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);

  if (!latestLandmarks) return;

  ctx.lineWidth = Math.max(4, canvas.width * 0.008);
  ctx.strokeStyle = "#18a999";
  ctx.fillStyle = "#f28c28";

  for (const [startName, endName] of bones) {
    const start = point(startName);
    const end = point(endName);
    if (!isVisible(start) || !isVisible(end)) continue;

    ctx.beginPath();
    ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
    ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
    ctx.stroke();
  }

  for (const name of Object.keys(landmarkIndex)) {
    const p = point(name);
    if (!isVisible(p)) continue;

    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, Math.max(5, canvas.width * 0.01), 0, Math.PI * 2);
    ctx.fill();
  }
}

function estimateMeasurements(landmarks, heightInches) {
  const profile = selectedProfile();
  const leftShoulder = point("leftShoulder", landmarks);
  const rightShoulder = point("rightShoulder", landmarks);
  const leftHip = point("leftHip", landmarks);
  const rightHip = point("rightHip", landmarks);
  const leftAnkle = point("leftAnkle", landmarks);
  const rightAnkle = point("rightAnkle", landmarks);
  const nose = point("nose", landmarks);

  const visibleCount = [
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    leftAnkle,
    rightAnkle,
    nose
  ].filter(isVisible).length;

  if (visibleCount < 5) {
    throw new Error("Not enough visible landmarks.");
  }

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const bottomY = Math.max(
    visibleY(leftAnkle, hipMid.y),
    visibleY(rightAnkle, hipMid.y),
    hipMid.y
  );
  const topY = Math.min(visibleY(nose, shoulderMid.y), shoulderMid.y);
  const bodyPixelHeight = Math.max(1, (bottomY - topY) * canvas.height);
  const scale = heightInches / bodyPixelHeight;

  const shoulderWidth = distance(leftShoulder, rightShoulder) * canvas.width * scale;
  const hipWidth = distance(leftHip, rightHip) * canvas.width * scale;
  const leftInseam = distance(leftHip, leftAnkle) * canvas.height * scale * 0.92;
  const rightInseam = distance(rightHip, rightAnkle) * canvas.height * scale * 0.92;
  const inseam = average([leftInseam, rightInseam].filter((value) => value > 0));

  const multipliers = measurementMultipliers(profile);
  const chest = shoulderWidth * multipliers.chest;
  const waist = hipWidth * multipliers.waist;
  const hips = hipWidth * multipliers.hips;
  const stomach = (waist * 0.58) + (hips * 0.42);

  return {
    profile,
    chest,
    stomach,
    waist,
    hips,
    shoulders: shoulderWidth,
    inseam,
    underbust: chest * 0.86,
    neck: shoulderWidth * 0.78,
    confidence: visibleCount >= 7 ? "Medium demo estimate" : "Low demo estimate"
  };
}

function showEstimates(estimate) {
  const specificLabel = document.querySelector("#specificLabel");
  document.querySelector("#chestLabel").textContent =
    estimate.profile === "female" ? "Bust / chest" : "Chest";
  specificLabel.textContent = estimate.profile === "female" ? "Underbust / band" : "Neck";

  setValue("chestValue", estimate.chest);
  setValue("stomachValue", estimate.stomach);
  setValue("waistValue", estimate.waist);
  setValue("hipsValue", estimate.hips);
  setValue("shouldersValue", estimate.shoulders);
  setValue("inseamValue", estimate.inseam);
  setValue("specificValue", estimate.profile === "female" ? estimate.underbust : estimate.neck);
  document.querySelector("#confidenceText").textContent = `Confidence: ${estimate.confidence}`;
  results.hidden = false;
}

function selectedProfile() {
  return document.querySelector("input[name='profile']:checked")?.value || "neutral";
}

function measurementMultipliers(profile) {
  if (profile === "male") {
    return { chest: 2.28, waist: 1.74, hips: 1.96 };
  }

  if (profile === "female") {
    return { chest: 2.15, waist: 1.65, hips: 2.08 };
  }

  return { chest: 2.2, waist: 1.69, hips: 2.02 };
}

function setValue(id, value) {
  document.querySelector(`#${id}`).textContent = `${value.toFixed(1)} in`;
}

function point(name, landmarks = latestLandmarks) {
  return landmarks?.[landmarkIndex[name]];
}

function isVisible(p) {
  return Boolean(p && (p.visibility ?? 1) > 0.45);
}

function visibleY(point, fallback) {
  return isVisible(point) ? point.y : fallback;
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1)
  };
}

function distance(a, b) {
  if (!isVisible(a) || !isVisible(b)) return 0;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

bootPoseModel().catch((error) => {
  console.error(error);
  modelStatus.textContent = "Model failed";
  alert("Could not load the pose model. Check your internet connection.");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
