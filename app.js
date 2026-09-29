(() => {
  "use strict";

  const API_URL = "http://127.0.0.1:8000/predict";
  const MAX_SCORE = 10;          // change if your model's score uses another range
  const TIMEOUT_MS = 20000;
  const CIRCUMFERENCE = 2 * Math.PI * 52;

  const INT_FIELDS = ["age", "daily_Unlocks"];
  const FLOAT_FIELDS = [
    "avg_Daily_Usage_Hours",
    "study_Hours",
    "physical_Activity_Hours",
    "sleep_Hours_Per_Night",
  ];

  const form = document.getElementById("predict-form");
  const formError = document.getElementById("form-error");
  const submitBtn = document.getElementById("submit-btn");
  const result = document.getElementById("result");
  const errorMessage = document.getElementById("error-message");
  const scoreValue = document.getElementById("score-value");
  const scoreScale = document.getElementById("score-scale");
  const gaugeBar = document.getElementById("gauge-bar");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- helpers ---------- */
  const setState = (state) => { result.dataset.state = state; };

  const controls = () => Array.from(form.elements).filter((el) => el.name);

  function setFieldError(name, message) {
    const el = form.elements[name];
    const out = document.getElementById(`err-${name}`);
    if (!el || !out) return false;
    out.textContent = message || "";
    el.closest(".field").classList.toggle("invalid", Boolean(message));
    return true;
  }

  function clearErrors() {
    controls().forEach((el) => setFieldError(el.name, ""));
    formError.hidden = true;
    formError.textContent = "";
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function buildPayload() {
    const data = {};
    controls().forEach((el) => {
      const value = el.value.trim();
      if (INT_FIELDS.includes(el.name)) data[el.name] = parseInt(value, 10);
      else if (FLOAT_FIELDS.includes(el.name)) data[el.name] = parseFloat(value);
      else data[el.name] = value;
    });
    return data;
  }

  /* ---------- client-side validation ---------- */
  function validate() {
    let firstInvalid = null;
    controls().forEach((el) => {
      let message = "";
      if (!el.value.trim()) message = "This field is required.";
      else if (!el.checkValidity()) {
        if (el.validity.rangeUnderflow) message = `Enter ${el.min} or more.`;
        else if (el.validity.rangeOverflow) message = `Enter ${el.max} or less.`;
        else if (el.validity.stepMismatch && el.step === "1") message = "Enter a whole number.";
        else message = el.validationMessage;
      }
      if (message) {
        setFieldError(el.name, message);
        firstInvalid = firstInvalid || el;
      }
    });
    if (firstInvalid) {
      firstInvalid.focus();
      showFormError("Fix the highlighted fields and try again.");
      return false;
    }
    return true;
  }

  /* ---------- server validation (FastAPI 422) ---------- */
  function handleValidationErrors(detail) {
    const unmatched = [];
    if (Array.isArray(detail)) {
      detail.forEach((item) => {
        const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null;
        const message = item.msg || "Invalid value.";
        if (!setFieldError(field, message)) unmatched.push(message);
      });
    } else if (typeof detail === "string") {
      unmatched.push(detail);
    }
    const first = form.querySelector(".field.invalid input, .field.invalid select");
    if (first) first.focus();
    showFormError(
      unmatched.length
        ? unmatched.join(" ")
        : "The server rejected some values. Check the highlighted fields."
    );
    setState("idle");
  }

  /* ---------- result rendering ---------- */
  function showScore(score) {
    const clamped = Math.min(Math.max(score, 0), MAX_SCORE);
    scoreScale.textContent = `out of ${MAX_SCORE}`;
    setState("done");

    // Animate ring after the view is visible so the transition runs
    gaugeBar.style.strokeDashoffset = CIRCUMFERENCE;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      gaugeBar.style.strokeDashoffset = CIRCUMFERENCE * (1 - clamped / MAX_SCORE);
    }));

    if (reduceMotion) { scoreValue.textContent = score.toFixed(1); return; }
    const start = performance.now();
    const duration = 900;
    (function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      scoreValue.textContent = (score * eased).toFixed(1);
      if (t < 1) requestAnimationFrame(tick);
    })(start);
  }

  function showError(message) {
    errorMessage.textContent = message;
    setState("error");
  }

  /* ---------- submit ---------- */
  async function onSubmit(event) {
    event.preventDefault();
    clearErrors();
    if (!validate()) return;

    setState("loading");
    submitBtn.disabled = true;
    submitBtn.textContent = "Predicting…";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildPayload()),
        signal: controller.signal,
      });

      let body = null;
      try { body = await response.json(); } catch (_) { /* non-JSON body */ }

      if (response.status === 422) {
        handleValidationErrors(body && body.detail);
      } else if (!response.ok) {
        showError(`The server returned an error (status ${response.status}). Check the terminal running uvicorn for details.`);
      } else if (body && typeof body.predict_Mental_Health_Score === "number") {
        showScore(body.predict_Mental_Health_Score);
      } else {
        showError("The server replied, but the response had no predicted score.");
      }
    } catch (err) {
      if (err.name === "AbortError") {
        showError("The request timed out. Check that the API is running and try again.");
      } else {
        showError("Can't reach the API at 127.0.0.1:8000. Make sure uvicorn is running and that the page is allowed by CORS.");
      }
    } finally {
      clearTimeout(timer);
      submitBtn.disabled = false;
      submitBtn.textContent = "Predict score";
    }
  }

  /* ---------- events ---------- */
  form.addEventListener("submit", onSubmit);
  form.addEventListener("reset", () => { clearErrors(); setState("idle"); });
  form.addEventListener("input", (e) => {
    if (e.target.name) setFieldError(e.target.name, "");
  });
  document.getElementById("retry-btn").addEventListener("click", () => form.requestSubmit());
})();
