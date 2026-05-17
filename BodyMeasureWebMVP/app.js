const heightInput = document.querySelector("#heightInput");
const calibrationSelect = document.querySelector("#calibrationSelect");
const analyzeButton = document.querySelector("#analyzeButton");
const modelStatus = document.querySelector("#modelStatus");
const resultsPanel = document.querySelector("#results");

const views = {
  front: {
    image: null,
    landmarks: null,
    canvas: document.querySelector("#frontCanvas"),
    empty: document.querySelector("#frontEmpty"),
    status: document.querySelector("#frontStatus")
  },
  side: {
    image: null,
    landmarks: null,
    canvas: document.querySelector("#sideCanvas"),
    empty: document.querySelector("#sideEmpty"),
    status: document.querySelector("#sideStatus")
  }
};

views.front.ctx = views.front.canvas.getContext("2d");
views.side.ctx = views.side.canvas.getContext("2d");

let pose;
let pendingPoseResolve;

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
    if (pendingPoseResolve) {
      pendingPoseResolve(results.poseLandmarks || null);
      pendingPoseResolve = null;
    }
  });

  modelStatus.textContent = "Ready";
}

document.querySelectorAll(".image-input").forEach((input) => {
  input.addEventListener("change", handleImageSelection);
});

document.querySelectorAll("input[name='profile']").forEach((input) => {
  input.addEventListener("change", refreshResultsIfReady);
});

calibrationSelect.addEventListener("change", refreshResultsIfReady);

async function handleImageSelection(event) {
  const file = event.target.files?.[0];
  const viewName = event.target.dataset.view;
  if (!file || !views[viewName]) return;

  const image = new Image();
  image.onload = () => {
    const view = views[viewName];
    view.image = image;
    view.landmarks = null;
    view.empty.hidden = true;
    view.status.textContent = "Added";
    view.status.classList.add("ready");
    resultsPanel.hidden = true;
    resizeCanvasForImage(view.canvas, image);
    drawView(viewName);
    updateAnalyzeState();
  };
  image.src = URL.createObjectURL(file);
}

analyzeButton.addEventListener("click", async () => {
  if (!views.front.image || !views.side.image || !pose) return;

  const height = Number(heightInput.value);
  if (!Number.isFinite(height) || height < 36 || height > 96) {
    alert("Enter height in inches, for example 66.");
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = "Analyzing...";
  modelStatus.textContent = "Analyzing";

  try {
    views.front.landmarks = await detectPose(views.front.image);
    views.side.landmarks = await detectPose(views.side.image);

    if (!views.front.landmarks || !views.side.landmarks) {
      alert("Could not detect pose in both photos. Use clear full-body front and side images.");
      return;
    }

    drawView("front");
    drawView("side");
    showEstimates(estimateMeasurements(height));
  } catch (error) {
    alert(error.message || "Could not estimate measurements from these photos.");
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze Front + Side";
    modelStatus.textContent = "Ready";
  }
});

function detectPose(image) {
  return new Promise((resolve, reject) => {
    pendingPoseResolve = resolve;
    pose.send({ image }).catch((error) => {
      pendingPoseResolve = null;
      reject(error);
    });
  });
}

function updateAnalyzeState() {
  analyzeButton.disabled = !(views.front.image && views.side.image);
}

function refreshResultsIfReady() {
  if (views.front.landmarks && views.side.landmarks) {
    const height = Number(heightInput.value);
    if (Number.isFinite(height)) {
      showEstimates(estimateMeasurements(height));
    }
  }
}

function resizeCanvasForImage(canvas, image) {
  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
}

function drawView(viewName) {
  const view = views[viewName];
  if (!view.image) return;

  view.ctx.clearRect(0, 0, view.canvas.width, view.canvas.height);
  view.ctx.drawImage(view.image, 0, 0, view.canvas.width, view.canvas.height);

  if (!view.landmarks) return;

  view.ctx.lineWidth = Math.max(4, view.canvas.width * 0.008);
  view.ctx.strokeStyle = "#18a999";
  view.ctx.fillStyle = "#f28c28";

  for (const [startName, endName] of bones) {
    const start = point(startName, view.landmarks);
    const end = point(endName, view.landmarks);
    if (!isVisible(start) || !isVisible(end)) continue;

    view.ctx.beginPath();
    view.ctx.moveTo(start.x * view.canvas.width, start.y * view.canvas.height);
    view.ctx.lineTo(end.x * view.canvas.width, end.y * view.canvas.height);
    view.ctx.stroke();
  }

  for (const name of Object.keys(landmarkIndex)) {
    const p = point(name, view.landmarks);
    if (!isVisible(p)) continue;

    view.ctx.beginPath();
    view.ctx.arc(p.x * view.canvas.width, p.y * view.canvas.height, Math.max(5, view.canvas.width * 0.01), 0, Math.PI * 2);
    view.ctx.fill();
  }
}

function estimateMeasurements(heightInches) {
  const profile = selectedProfile();
  const front = extractPoseMetrics(views.front, "front");
  const side = extractPoseMetrics(views.side, "side");

  const scale = heightInches / front.bodyPixelHeight;
  const calibrationBoost = calibrationSelect.value === "height" ? 0 : 1;

  const shoulderWidth = front.shoulderWidthPx * scale;
  const hipWidth = front.hipWidthPx * scale;
  const torsoWidth = weightedAverage([
    [shoulderWidth * 0.82, 0.5],
    [hipWidth * 0.78, 0.5]
  ]);

  const sideDepthRaw = side.bodyDepthPx * scale;
  const frontDepthGuess = torsoWidth * profileDepthRatio(profile);
  const torsoDepth = clamp(
    weightedAverage([
      [sideDepthRaw, 0.68],
      [frontDepthGuess, 0.32]
    ]),
    torsoWidth * 0.42,
    torsoWidth * 0.88
  );

  const chestWidth = shoulderWidth * chestWidthRatio(profile);
  const waistWidth = hipWidth * waistWidthRatio(profile);
  const hipCircWidth = hipWidth;

  const chestDepth = torsoDepth * chestDepthRatio(profile);
  const waistDepth = torsoDepth * waistDepthRatio(profile);
  const hipDepth = torsoDepth * hipDepthRatio(profile);
  const stomachWidth = weightedAverage([
    [waistWidth, 0.55],
    [hipCircWidth, 0.45]
  ]);
  const stomachDepth = weightedAverage([
    [waistDepth, 0.45],
    [hipDepth, 0.55]
  ]);

  const leftInseam = segmentLength("leftHip", "leftAnkle", views.front) * scale * 0.92;
  const rightInseam = segmentLength("rightHip", "rightAnkle", views.front) * scale * 0.92;

  const confidenceScore = confidenceFrom(front, side, calibrationBoost);

  return {
    profile,
    chest: ellipseCircumference(chestWidth, chestDepth),
    stomach: ellipseCircumference(stomachWidth, stomachDepth),
    waist: ellipseCircumference(waistWidth, waistDepth),
    hips: ellipseCircumference(hipCircWidth, hipDepth),
    shoulders: shoulderWidth,
    inseam: average([leftInseam, rightInseam].filter((value) => value > 0)),
    underbust: ellipseCircumference(chestWidth * 0.9, chestDepth * 0.86),
    neck: shoulderWidth * 0.78,
    confidence: confidenceLabel(confidenceScore)
  };
}

function extractPoseMetrics(view, viewName) {
  const landmarks = view.landmarks;
  const canvas = view.canvas;
  const leftShoulder = point("leftShoulder", landmarks);
  const rightShoulder = point("rightShoulder", landmarks);
  const leftHip = point("leftHip", landmarks);
  const rightHip = point("rightHip", landmarks);
  const leftAnkle = point("leftAnkle", landmarks);
  const rightAnkle = point("rightAnkle", landmarks);
  const nose = point("nose", landmarks);

  const torsoPoints = [leftShoulder, rightShoulder, leftHip, rightHip];
  const visibleTorsoPoints = torsoPoints.filter(isVisible);
  if (viewName === "front" && visibleTorsoPoints.length < 4) {
    throw new Error("Front photo needs visible left and right shoulders and hips.");
  }

  if (viewName === "side" && visibleTorsoPoints.length < 2) {
    throw new Error("Side photo needs visible shoulder and hip landmarks.");
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

  return {
    visibleCount: [
      leftShoulder,
      rightShoulder,
      leftHip,
      rightHip,
      leftAnkle,
      rightAnkle,
      nose
    ].filter(isVisible).length,
    bodyPixelHeight,
    shoulderWidthPx: normalizedDistance(leftShoulder, rightShoulder, canvas),
    hipWidthPx: normalizedDistance(leftHip, rightHip, canvas),
    bodyDepthPx: horizontalSpan(torsoPoints, canvas)
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
  resultsPanel.hidden = false;
}

function selectedProfile() {
  return document.querySelector("input[name='profile']:checked")?.value || "neutral";
}

function chestWidthRatio(profile) {
  if (profile === "male") return 1.03;
  if (profile === "female") return 0.98;
  return 1;
}

function waistWidthRatio(profile) {
  if (profile === "male") return 0.86;
  if (profile === "female") return 0.78;
  return 0.82;
}

function profileDepthRatio(profile) {
  if (profile === "male") return 0.58;
  if (profile === "female") return 0.55;
  return 0.56;
}

function chestDepthRatio(profile) {
  if (profile === "male") return 1.04;
  if (profile === "female") return 1.0;
  return 1.02;
}

function waistDepthRatio(profile) {
  if (profile === "male") return 0.88;
  if (profile === "female") return 0.82;
  return 0.85;
}

function hipDepthRatio(profile) {
  if (profile === "male") return 0.98;
  if (profile === "female") return 1.08;
  return 1.02;
}

function ellipseCircumference(width, depth) {
  const a = Math.max(width, depth) / 2;
  const b = Math.min(width, depth) / 2;
  if (!a || !b) return 0;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

function confidenceFrom(front, side, calibrationBoost) {
  const landmarkScore = Math.min(7, front.visibleCount + side.visibleCount - 7);
  const sideDepthScore = side.bodyDepthPx > front.hipWidthPx * 0.18 ? 1 : 0;
  return landmarkScore + sideDepthScore + calibrationBoost;
}

function confidenceLabel(score) {
  if (score >= 7) return "Higher demo estimate";
  if (score >= 5) return "Medium demo estimate";
  return "Low demo estimate";
}

function segmentLength(a, b, view) {
  return normalizedDistance(point(a, view.landmarks), point(b, view.landmarks), view.canvas);
}

function normalizedDistance(a, b, canvas) {
  if (!isVisible(a) || !isVisible(b)) return 0;
  const dx = (a.x - b.x) * canvas.width;
  const dy = (a.y - b.y) * canvas.height;
  return Math.hypot(dx, dy);
}

function horizontalSpan(points, canvas) {
  const visible = points.filter(isVisible);
  if (visible.length < 2) return 0;
  const xs = visible.map((p) => p.x * canvas.width);
  return Math.max(...xs) - Math.min(...xs);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function weightedAverage(items) {
  const totalWeight = items.reduce((sum, item) => sum + item[1], 0);
  return items.reduce((sum, item) => sum + item[0] * item[1], 0) / totalWeight;
}

function setValue(id, value) {
  document.querySelector(`#${id}`).textContent = `${value.toFixed(1)} in`;
}

function point(name, landmarks) {
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
