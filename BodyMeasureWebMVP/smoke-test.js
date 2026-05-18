const fs = require("fs");
const vm = require("vm");

function stubElement() {
  return {
    addEventListener() {},
    classList: { add() {}, remove() {} },
    style: {},
    querySelector() {
      return { value: "1" };
    },
    getContext() {
      return {
        clearRect() {},
        drawImage() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        arc() {},
        fill() {},
        fillText() {}
      };
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 500, height: 1000 };
    },
    textContent: "",
    hidden: false,
    disabled: false,
    value: "66"
  };
}

const context = {
  console,
  Math,
  Number,
  Array,
  Object,
  String,
  Boolean,
  Promise,
  URL: {
    revokeObjectURL() {},
    createObjectURL() {
      return "blob:test";
    }
  },
  Image: function Image() {},
  Pose: function Pose() {
    this.setOptions = () => {};
    this.onResults = () => {};
  },
  document: {
    querySelector() {
      return stubElement();
    },
    querySelectorAll() {
      return { forEach() {} };
    },
    createElement() {
      return {
        width: 500,
        height: 1000,
        getContext() {
          return {
            fillStyle: "",
            fillRect() {},
            drawImage() {}
          };
        }
      };
    }
  },
  window: { addEventListener() {} },
  navigator: {
    serviceWorker: {
      register() {
        return { catch() {} };
      }
    }
  }
};

const appSource = fs.readFileSync("app.js", "utf8");
const testSource = `
views.front.refs = {
  topHead: { x: 0.5, y: 0.05, visibility: 1 },
  leftShoulder: { x: 0.3, y: 0.2, visibility: 1 },
  rightShoulder: { x: 0.7, y: 0.2, visibility: 1 },
  leftWaist: { x: 0.38, y: 0.42, visibility: 1 },
  rightWaist: { x: 0.62, y: 0.42, visibility: 1 },
  leftHip: { x: 0.34, y: 0.55, visibility: 1 },
  rightHip: { x: 0.66, y: 0.55, visibility: 1 },
  leftKnee: { x: 0.38, y: 0.75, visibility: 1 },
  rightKnee: { x: 0.62, y: 0.75, visibility: 1 },
  leftToe: { x: 0.4, y: 0.95, visibility: 1 },
  rightToe: { x: 0.6, y: 0.95, visibility: 1 }
};
views.side.refs = {
  topHead: { x: 0.5, y: 0.05, visibility: 1 },
  bustBack: { x: 0.42, y: 0.3, visibility: 1 },
  bustFront: { x: 0.58, y: 0.3, visibility: 1 },
  hipBack: { x: 0.4, y: 0.55, visibility: 1 },
  hipFront: { x: 0.62, y: 0.55, visibility: 1 },
  toe: { x: 0.58, y: 0.95, visibility: 1 }
};
views.front.canvas = { width: 500, height: 1000 };
views.side.canvas = { width: 500, height: 1000 };
heightInput.value = "66";
calibrationSelect.value = "height";
const result = estimateMeasurements(66);
const required = ["chest", "stomach", "waist", "hips", "shoulders", "inseam"];
for (const key of required) {
  if (!Number.isFinite(result[key])) {
    throw new Error(key + " is not finite");
  }
}
if (!result.bodyShape) {
  throw new Error("bodyShape missing");
}
console.log("smoke ok", JSON.stringify(result));
`;

vm.runInNewContext(`${appSource}\n${testSource}`, context);
