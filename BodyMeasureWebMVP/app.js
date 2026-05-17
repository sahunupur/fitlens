const heightInput = document.querySelector("#heightInput");
const calibrationSelect = document.querySelector("#calibrationSelect");
const analyzeButton = document.querySelector("#analyzeButton");
const modelStatus = document.querySelector("#modelStatus");
const resultsPanel = document.querySelector("#results");

const views = {
  front: {
    image: null,
    objectUrl: null,
    landmarks: null,
    stage: document.querySelector("#frontStage"),
    preview: document.querySelector("#frontPreview"),
    canvas: document.querySelector("#frontCanvas"),
    empty: document.querySelector("#frontEmpty"),
    status: document.querySelector("#frontStatus"),
    cropTools: document.querySelector(".crop-tools[data-view='front']"),
    crop: { zoom: 1, x: 0, y: 0 }
  },
  side: {
    image: null,
    objectUrl: null,
    landmarks: null,
    stage: document.querySelector("#sideStage"),
    preview: document.querySelector("#sidePreview"),
    canvas: document.querySelector("#sideCanvas"),
    empty: document.querySelector("#sideEmpty"),
    status: document.querySelector("#sideStatus"),
    cropTools: document.querySelector(".crop-tools[data-view='side']"),
    crop: { zoom: 1, x: 0, y: 0 }
  }
};

views.front.ctx = views.front.canvas.getContext("2d");
views.side.ctx = views.side.canvas.getContext("2d");

let pose;
let pendingPoseResolve;
const gestureState = {
  front: { pointers: new Map(), startCrop: null, startCenter: null, startDistance: null, dragJoint: null },
  side: { pointers: new Map(), startCrop: null, startCenter: null, startDistance: null, dragJoint: null }
};

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

document.querySelectorAll(".crop-input").forEach((input) => {
  input.addEventListener("input", handleCropChange);
});

document.querySelectorAll(".crop-reset").forEach((button) => {
  button.addEventListener("click", resetCrop);
});

Object.keys(views).forEach((viewName) => {
  const stage = views[viewName].stage;
  stage.addEventListener("pointerdown", (event) => handlePointerDown(event, viewName));
  stage.addEventListener("pointermove", (event) => handlePointerMove(event, viewName));
  stage.addEventListener("pointerup", (event) => handlePointerUp(event, viewName));
  stage.addEventListener("pointercancel", (event) => handlePointerUp(event, viewName));
  stage.addEventListener("pointerleave", (event) => handlePointerUp(event, viewName));
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
    if (view.objectUrl) {
      URL.revokeObjectURL(view.objectUrl);
    }

    view.objectUrl = image.src;
    view.image = image;
    view.landmarks = null;
    view.crop = { zoom: 1, x: 0, y: 0 };
    view.empty.hidden = true;
    view.preview.src = view.objectUrl;
    view.preview.hidden = false;
    view.cropTools.hidden = false;
    resetCropInputs(viewName);
    applyCrop(viewName);
    view.stage.classList.add("has-photo");
    view.stage.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
    view.status.textContent = "Added";
    view.status.classList.add("ready");
    resultsPanel.hidden = true;
    resizeCanvasForImage(view.canvas, image);
    drawView(viewName);
    updateAnalyzeState();
  };
  image.src = URL.createObjectURL(file);
}

function handleCropChange(event) {
  const tools = event.target.closest(".crop-tools");
  const viewName = tools?.dataset.view;
  const view = views[viewName];
  if (!view) return;

  view.crop[event.target.dataset.control] = Number(event.target.value);
  invalidateAnalysis(viewName);
}

function resetCrop(event) {
  const viewName = event.currentTarget.dataset.view;
  const view = views[viewName];
  if (!view) return;

  view.crop = { zoom: 1, x: 0, y: 0 };
  resetCropInputs(viewName);
  invalidateAnalysis(viewName);
}

function handlePointerDown(event, viewName) {
  const view = views[viewName];
  if (!view.image) return;

  event.preventDefault();
  view.stage.setPointerCapture(event.pointerId);

  const state = gestureState[viewName];
  const nearestJoint = findNearestJoint(viewName, event);
  if (nearestJoint) {
    state.dragJoint = nearestJoint;
    state.pointers.clear();
    return;
  }

  state.pointers.set(event.pointerId, pointerPosition(event));
  state.startCrop = { ...view.crop };
  state.startCenter = pointerCenter(state.pointers);
  state.startDistance = pointerDistance(state.pointers);
}

function handlePointerMove(event, viewName) {
  const view = views[viewName];
  const state = gestureState[viewName];
  if (!view.image) return;

  event.preventDefault();

  if (state.dragJoint) {
    moveJoint(viewName, state.dragJoint, event);
    return;
  }

  if (!state.pointers.has(event.pointerId)) return;
  state.pointers.set(event.pointerId, pointerPosition(event));

  const center = pointerCenter(state.pointers);
  const rect = view.stage.getBoundingClientRect();
  const dx = ((center.x - state.startCenter.x) / Math.max(1, rect.width)) * 100;
  const dy = ((center.y - state.startCenter.y) / Math.max(1, rect.height)) * 100;
  let zoom = state.startCrop.zoom;

  if (state.pointers.size >= 2 && state.startDistance > 0) {
    zoom = state.startCrop.zoom * (pointerDistance(state.pointers) / state.startDistance);
  }

  setCrop(viewName, {
    zoom,
    x: state.startCrop.x + dx,
    y: state.startCrop.y + dy
  });
}

function handlePointerUp(event, viewName) {
  const state = gestureState[viewName];
  if (state.dragJoint) {
    state.dragJoint = null;
    return;
  }

  state.pointers.delete(event.pointerId);

  if (state.pointers.size > 0) {
    state.startCrop = { ...views[viewName].crop };
    state.startCenter = pointerCenter(state.pointers);
    state.startDistance = pointerDistance(state.pointers);
  }
}

function findNearestJoint(viewName, event) {
  const view = views[viewName];
  if (!view.landmarks) return null;

  const rect = view.canvas.getBoundingClientRect();
  const pointer = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
  let closest = null;
  let closestDistance = Infinity;

  for (const [jointName, index] of Object.entries(landmarkIndex)) {
    const landmark = view.landmarks[index];
    if (!isVisible(landmark)) continue;

    const jointPoint = {
      x: landmark.x * rect.width,
      y: landmark.y * rect.height
    };
    const distance = Math.hypot(pointer.x - jointPoint.x, pointer.y - jointPoint.y);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = jointName;
    }
  }

  return closestDistance <= 34 ? closest : null;
}

function moveJoint(viewName, jointName, event) {
  const view = views[viewName];
  const rect = view.canvas.getBoundingClientRect();
  const index = landmarkIndex[jointName];
  const existing = view.landmarks[index] || {};

  view.landmarks[index] = {
    ...existing,
    x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
    y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
    visibility: 1
  };

  drawView(viewName);
  refreshResultsIfReady();
}

function pointerPosition(event) {
  return { x: event.clientX, y: event.clientY };
}

function pointerCenter(pointers) {
  const values = Array.from(pointers.values());
  return {
    x: average(values.map((point) => point.x)),
    y: average(values.map((point) => point.y))
  };
}

function pointerDistance(pointers) {
  const values = Array.from(pointers.values());
  if (values.length < 2) return 0;
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}

function setCrop(viewName, crop) {
  const view = views[viewName];
  view.crop = {
    zoom: clamp(crop.zoom, 1, 3),
    x: clamp(crop.x, -50, 50),
    y: clamp(crop.y, -50, 50)
  };
  syncCropInputs(viewName);
  invalidateAnalysis(viewName);
}

function invalidateAnalysis(viewName) {
  views[viewName].landmarks = null;
  resultsPanel.hidden = true;
  clearOverlay(viewName);
  applyCrop(viewName);
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
    const frontAnalysisImage = buildAnalysisCanvas(views.front);
    const sideAnalysisImage = buildAnalysisCanvas(views.side);

    views.front.landmarks = await detectPose(frontAnalysisImage);
    views.side.landmarks = await detectPose(sideAnalysisImage);

    if (!hasHumanPose(views.front.landmarks)) {
      alert("No human body detected in the front photo. Please upload a clear full-body human photo.");
      return;
    }

    if (!hasHumanPose(views.side.landmarks)) {
      alert("No human body detected in the side photo. Please upload a clear full-body human photo.");
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

function applyCrop(viewName) {
  const view = views[viewName];
  const { zoom, x, y } = view.crop;
  view.preview.style.transform = `translate(${x}%, ${y}%) scale(${zoom})`;
}

function resetCropInputs(viewName) {
  const tools = views[viewName].cropTools;
  tools.querySelector("[data-control='zoom']").value = "1";
  tools.querySelector("[data-control='x']").value = "0";
  tools.querySelector("[data-control='y']").value = "0";
}

function syncCropInputs(viewName) {
  const tools = views[viewName].cropTools;
  tools.querySelector("[data-control='zoom']").value = String(views[viewName].crop.zoom);
  tools.querySelector("[data-control='x']").value = String(views[viewName].crop.x);
  tools.querySelector("[data-control='y']").value = String(views[viewName].crop.y);
}

function clearOverlay(viewName) {
  const view = views[viewName];
  view.ctx.clearRect(0, 0, view.canvas.width, view.canvas.height);
}

function buildAnalysisCanvas(view) {
  const output = document.createElement("canvas");
  output.width = view.canvas.width;
  output.height = view.canvas.height;

  const outputCtx = output.getContext("2d");
  const fit = containRect(view.image.naturalWidth, view.image.naturalHeight, output.width, output.height);
  const { zoom, x, y } = view.crop;
  const drawWidth = fit.width * zoom;
  const drawHeight = fit.height * zoom;
  const offsetX = fit.x + (fit.width - drawWidth) / 2 + (x / 100) * fit.width;
  const offsetY = fit.y + (fit.height - drawHeight) / 2 + (y / 100) * fit.height;

  outputCtx.fillStyle = "#101617";
  outputCtx.fillRect(0, 0, output.width, output.height);
  outputCtx.drawImage(view.image, offsetX, offsetY, drawWidth, drawHeight);

  return output;
}

function containRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height
  };
}

function drawView(viewName) {
  const view = views[viewName];
  if (!view.image) return;

  clearOverlay(viewName);

  if (!view.landmarks) return;

  const analysisImage = buildAnalysisCanvas(view);
  view.ctx.drawImage(analysisImage, 0, 0, view.canvas.width, view.canvas.height);
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

function hasHumanPose(landmarks) {
  if (!landmarks) return false;
  const required = [
    point("leftShoulder", landmarks),
    point("rightShoulder", landmarks),
    point("leftHip", landmarks),
    point("rightHip", landmarks)
  ];
  return required.filter(isVisible).length >= 2;
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
  const chest = ellipseCircumference(chestWidth, chestDepth);
  const stomach = ellipseCircumference(stomachWidth, stomachDepth);
  const waist = ellipseCircumference(waistWidth, waistDepth);
  const hips = ellipseCircumference(hipCircWidth, hipDepth);

  return {
    profile,
    bodyShape: classifyBodyShape({ chest, waist, hips, shoulders: shoulderWidth }),
    chest,
    stomach,
    waist,
    hips,
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

  document.querySelector("#bodyShapeValue").textContent = estimate.bodyShape;
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

function classifyBodyShape({ chest, waist, hips, shoulders }) {
  const upper = weightedAverage([
    [chest, 0.78],
    [shoulders * 2.25, 0.22]
  ]);
  const lower = hips;
  const upperLowerDiff = Math.abs(upper - lower) / Math.max(upper, lower);
  const waistToUpper = waist / upper;
  const waistToLower = waist / lower;

  if (upperLowerDiff <= 0.12 && waistToUpper <= 0.78 && waistToLower <= 0.78) {
    return "Hourglass";
  }

  if (waist >= Math.min(upper, lower) * 0.94) {
    return "Oval";
  }

  if (lower >= upper * 1.1) {
    return "Triangle";
  }

  if (upper >= lower * 1.1) {
    return "Inverted triangle";
  }

  if (waist >= Math.min(upper, lower) * 0.82) {
    return "Rectangle";
  }

  return "Balanced";
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
