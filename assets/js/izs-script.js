(function () {
  function setupZahlenstrahlApp(root) {
    const canvas = root.querySelector(".zs-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const canvasWrapper = root.querySelector(".zs-canvas-wrapper");

    const worldMinInput = root.querySelector(".zs-input-min");
    const worldMaxInput = root.querySelector(".zs-input-max");
    const markAInput = root.querySelector(".zs-input-markA");
    const markBInput = root.querySelector(".zs-input-markB");

    const heightRange = root.querySelector(".zs-height-range");
    const heightValueLabel = root.querySelector(".zs-height-value");

    const btnHeightSmall = root.querySelector(".zs-height-small");
    const btnHeightMedium = root.querySelector(".zs-height-medium");
    const btnHeightLarge = root.querySelector(".zs-height-large");

    const applyRangeBtn = root.querySelector(".zs-apply-range");
    const applyMarksBtn = root.querySelector(".zs-apply-marks"); // optional
    const resetMarksBtn = root.querySelector(".zs-reset-marks");
    const zoomInBtn = root.querySelector(".zs-zoom-in");
    const zoomOutBtn = root.querySelector(".zs-zoom-out");
    const toggleDecimalsBtn = root.querySelector(".zs-toggle-decimals");
    const fullscreenBtn = root.querySelector(".zs-fullscreen-btn");
    const appContainer = root.querySelector(".zs-app-container");

    // NEU: Button zum Ein-/Ausblenden der Optionen
    const toggleControlsBtn = root.querySelector(".zs-toggle-controls");

    // Messwerkzeug-Button: Abstand A–B ein/aus
    const measureToggleBtn = root.querySelector(".zs-measure-toggle");

    // Bereichs-Preset-Buttons
    const rangeBtn100 = root.querySelector(".zs-range-100");
    const rangeBtn1000 = root.querySelector(".zs-range-1000");
    const rangeBtn10000 = root.querySelector(".zs-range-10000");
    const rangeBtn100000 = root.querySelector(".zs-range-100000");
    const rangeBtn1000000 = root.querySelector(".zs-range-1000000");

    // Zentrier-Button für Markierungen A/B
    const centerMarksBtn = root.querySelector(".zs-center-marks");

    // Label-Umschalter (alle / jeden 2. / jeden 5. Strich)
    const labelModeBtn = root.querySelector(".zs-label-mode");

    // Export-Button PNG
    const exportPngBtn = root.querySelector(".zs-export-png");

    // Aktuelle Canvas-Höhe (Standard 300px, falls Range nicht gefunden)
    let canvasHeight = heightRange ? parseInt(heightRange.value, 10) || 300 : 300;

    let worldMin = parseFloat(worldMinInput.value) || 0;
    let worldMax = parseFloat(worldMaxInput.value) || 1000;
    let viewMin = worldMin;
    let viewMax = worldMax;

    let decimalsEnabled = false;

    // Kleinste gewünschte Einheit auf dem Zahlenstrahl (z.B. 0.001)
    const MIN_UNIT = 0.001;
    const MIN_VIEW_RANGE = MIN_UNIT * 10; // damit majorStep ≈ MIN_UNIT

    const PADDING_LEFT = 60;
    const PADDING_RIGHT = 60;
    const PADDING_TOP = 40;
    const PADDING_BOTTOM = 40;

    let isDragging = false;
    let dragStartX = 0;
    let dragStartViewMin = 0;
    let dragStartViewMax = 0;
    let didDragSinceMouseDown = false; // Klick vs. Drag unterscheiden

    // Für Hover-Funktion
    // tickPositions speichert: { value: number, x: number }
    let tickPositions = [];
    let hoverValue = null;  // aktuell „getroffener“ Tick-Wert

    // Flag, ob Abstand zwischen A und B angezeigt wird
    let measureABEnabled = false;

    // Label-Dichte (1 = alle, 2 = jeder 2., 5 = jeder 5.)
    let labelSkipMode = 1;

    // Spotlight-Variablen: nur Wrapper wird bewegt
    const originalWrapperParent = canvasWrapper ? canvasWrapper.parentElement : null;
    const originalWrapperNextSibling = canvasWrapper ? canvasWrapper.nextSibling : null;
    let spotlightOverlay = null;
    let isSpotlight = false;

    // während Drag fest eingefrorene Tick-Schritte
    let panMajorStep = null;
    let panMinorStep = null;

    // Touch-Status
    let isTouchDragging = false;
    let isPinchZoom = false;
    let lastPinchDist = null;
    let pinchCenterValue = null;

    // Schweizer Zahlenformat: 1000 → 1'000, 1000000 → 1'000'000
    function formatCH(value) {
      const parts = String(value).split(".");
      // Integerteil: Tausendertrennung mit '
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
      return parts.join(".");
    }

    // Redraw beim Verschieben drosseln (nur 1x pro Frame)
    let isPanDrawScheduled = false;
    function schedulePanDraw() {
      if (isPanDrawScheduled) return;
      isPanDrawScheduled = true;
      requestAnimationFrame(() => {
        isPanDrawScheduled = false;
        drawNumberLine();
      });
    }

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;

      canvas.width = rect.width;
      canvas.height = canvasHeight;
      canvas.style.minHeight = canvasHeight + "px";

      drawNumberLine();
    }

    function setWorldRangeFromInputs() {
      const minVal = parseFloat(worldMinInput.value);
      const maxVal = parseFloat(worldMaxInput.value);
      if (isNaN(minVal) || isNaN(maxVal) || minVal === maxVal) {
        return;
      }
      worldMin = Math.min(minVal, maxVal);
      worldMax = Math.max(minVal, maxVal);
      viewMin = worldMin;
      viewMax = worldMax;
      drawNumberLine();
    }

    // Sichtbereich auf Weltbereich zurücksetzen
    function resetViewToWorld() {
      viewMin = worldMin;
      viewMax = worldMax;
      drawNumberLine();
    }

    function getNiceTickStep(range, maxTicks) {
      if (range <= 0) return 1;
      const roughStep = range / maxTicks;
      const power = Math.pow(10, Math.floor(Math.log10(roughStep)));
      const normalized = roughStep / power;

      let niceNormalized;
      if (normalized <= 1) niceNormalized = 1;
      else if (normalized <= 2) niceNormalized = 2;
      else if (normalized <= 5) niceNormalized = 5;
      else niceNormalized = 10;

      return niceNormalized * power;
    }

    function valueToX(value) {
      const range = viewMax - viewMin || 1;
      const usableWidth = canvas.width - PADDING_LEFT - PADDING_RIGHT;
      return PADDING_LEFT + (value - viewMin) * (usableWidth / range);
    }

    function xToValue(x) {
      const range = viewMax - viewMin || 1;
      const usableWidth = canvas.width - PADDING_LEFT - PADDING_RIGHT;
      return viewMin + ((x - PADDING_LEFT) / usableWidth) * range;
    }

    function isMultipleOf(value, step) {
      if (step === 0) return false;
      const ratio = value / step;
      const nearest = Math.round(ratio);
      return Math.abs(ratio - nearest) < 1e-6;
    }

    function isMiddleBetweenMajors(value, majorStep) {
      if (majorStep <= 0) return false;
      const ratio = value / majorStep;
      const nearestHalf = Math.round(ratio * 2) / 2;
      return (
        Math.abs(ratio - nearestHalf) < 1e-6 &&
        Math.abs(ratio - Math.round(ratio)) > 1e-6
      );
    }

    // Schrittweiten (Major/Minor) berechnen
    function computeTickSteps(range, pixelsPerUnit) {
      let majorStep = getNiceTickStep(range, 10);

      if (!decimalsEnabled) {
        // Ganze Zahlen: auf mindestens 1 aufrunden
        majorStep = Math.max(1, Math.round(majorStep));
      } else {
        // Dezimalzahlen: Major-Step nie kleiner als MIN_UNIT (0.001)
        if (majorStep < MIN_UNIT) {
          majorStep = MIN_UNIT;
        }
      }

      const minorCandidates = [majorStep / 2, majorStep / 5, majorStep / 10];
      const MIN_MINOR_PX = 6;
      let minorStep = null;

      for (const cand of minorCandidates) {
        if (cand <= 0) continue;
        let stepVal = cand;

        if (!decimalsEnabled) {
          stepVal = Math.round(stepVal);
          if (stepVal < 1) continue;
        } else {
          // Auch Minor-Ticks nie kleiner als MIN_UNIT (0.001)
          if (stepVal < MIN_UNIT) continue;
        }

        const px = stepVal * pixelsPerUnit;
        if (px >= MIN_MINOR_PX) {
          if (minorStep === null || stepVal < minorStep) {
            minorStep = stepVal;
          }
        }
      }

      return { majorStep, minorStep };
    }


    function drawNumberLine() {
      if (!canvas.width || !canvas.height) return;

      const range = viewMax - viewMin;
      if (range === 0) return;

      tickPositions = [];

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const lineY = canvas.height / 2;

      // Hauptlinie
      ctx.strokeStyle = "#1d3557";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PADDING_LEFT, lineY);
      ctx.lineTo(canvas.width - PADDING_RIGHT, lineY);
      ctx.stroke();

      // Pfeile
      const arrowSize = 10;
      ctx.fillStyle = "#1d3557";

      ctx.beginPath();
      ctx.moveTo(PADDING_LEFT, lineY);
      ctx.lineTo(PADDING_LEFT + arrowSize, lineY - arrowSize / 2);
      ctx.lineTo(PADDING_LEFT + arrowSize, lineY + arrowSize / 2);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(canvas.width - PADDING_RIGHT, lineY);
      ctx.lineTo(canvas.width - PADDING_RIGHT - arrowSize, lineY - arrowSize / 2);
      ctx.lineTo(canvas.width - PADDING_RIGHT - arrowSize, lineY + arrowSize / 2);
      ctx.closePath();
      ctx.fill();

      const usableWidth = canvas.width - PADDING_LEFT - PADDING_RIGHT;
      const pixelsPerUnit = usableWidth / range;

      // Tick-Schritte: beim Drag eingefrorene Werte, sonst frisch berechnet
      let majorStep, minorStep;
      if (isDragging && panMajorStep !== null) {
        majorStep = panMajorStep;
        minorStep = panMinorStep;
      } else {
        const steps = computeTickSteps(range, pixelsPerUnit);
        majorStep = steps.majorStep;
        minorStep = steps.minorStep;
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      // Minor-Ticks
      if (minorStep !== null) {
        const firstMinor = Math.ceil(viewMin / minorStep) * minorStep;
        for (let v = firstMinor; v <= viewMax + minorStep * 0.5; v += minorStep) {
          if (isMultipleOf(v, majorStep)) continue;

          const x = valueToX(v);
          if (x < PADDING_LEFT - 5 || x > canvas.width - PADDING_RIGHT + 5) continue;

          const isMid = isMiddleBetweenMajors(v, majorStep);
          const tickHeight = isMid ? 24 : 16;

          ctx.strokeStyle = "#457b9d";
          ctx.lineWidth = isMid ? 1.4 : 1;

          ctx.beginPath();
          ctx.moveTo(x, lineY - tickHeight / 2);
          ctx.lineTo(x, lineY + tickHeight / 2);
          ctx.stroke();

          tickPositions.push({ value: v, x });
        }
      }

      // Major-Ticks + Labels
      const firstMajor = Math.ceil(viewMin / majorStep) * majorStep;

      const MAJOR_TICK_HEIGHT = 32;
      const BIG_MAJOR_TICK_HEIGHT = 40;
      const nextMagnitude = Math.pow(10, Math.round(Math.log10(majorStep)) + 1);

      let majorIndex = 0;

      for (let v = firstMajor; v <= viewMax + majorStep * 0.5; v += majorStep, majorIndex++) {
        const x = valueToX(v);
        if (x < PADDING_LEFT - 5 || x > canvas.width - PADDING_RIGHT + 5) continue;

        const isZero = Math.abs(v) < 1e-10;
        const isBig = isMultipleOf(v, nextMagnitude) || isZero;

        const tickHeight = isBig ? BIG_MAJOR_TICK_HEIGHT : MAJOR_TICK_HEIGHT;

        ctx.strokeStyle = "#1d3557";
        ctx.lineWidth = isBig ? 2.2 : 1.6;
        ctx.beginPath();
        ctx.moveTo(x, lineY - tickHeight / 2);
        ctx.lineTo(x, lineY + tickHeight / 2);
        ctx.stroke();

        // Label nur nach labelSkipMode – Big-Marks immer labeln
        const shouldLabel = isBig || (majorIndex % labelSkipMode === 0);

        if (shouldLabel) {
          let labelVal = decimalsEnabled
            ? Math.round(v * 1000) / 1000
            : Math.round(v);

          ctx.fillStyle = "#000";
          ctx.font = isBig ? "bold 18px system-ui" : "16px system-ui";
          ctx.fillText(formatCH(labelVal), x, lineY + tickHeight / 2 + 4);
        }

        tickPositions.push({ value: v, x });
      }

      // Hover-Anzeige über der Achse (nur wenn nicht Drag)
      if (!isDragging && hoverValue !== null && hoverValue >= viewMin && hoverValue <= viewMax) {
        const hx = valueToX(hoverValue);
        ctx.save();
        ctx.fillStyle = "#000";
        ctx.font = "bold 22px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const hoverLabelVal = decimalsEnabled
          ? Math.round(hoverValue * 1000) / 1000
          : Math.round(hoverValue);
        ctx.fillText(formatCH(hoverLabelVal), hx, lineY - 18);
        ctx.restore();
      }

      // Markierungen A & B
      let markA = parseFloat(markAInput.value);
      let markB = parseFloat(markBInput.value);

      if (!decimalsEnabled) {
        if (!isNaN(markA)) {
          markA = Math.round(markA);
          markAInput.value = markA;
        }
        if (!isNaN(markB)) {
          markB = Math.round(markB);
          markBInput.value = markB;
        }
      }

      const hasA = !isNaN(markA) && markA >= viewMin && markA <= viewMax;
      const hasB = !isNaN(markB) && markB >= viewMin && markB <= viewMax;

      if (hasA || hasB) {
        const r = 7;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.font = "20px system-ui";

        if (hasA) {
          const xA = valueToX(markA);
          ctx.fillStyle = "#e63946";
          ctx.beginPath();
          ctx.arc(xA, lineY, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText("A = " + formatCH(markA), xA, lineY - r - 34);
        }

        if (hasB) {
          const xB = valueToX(markB);
          ctx.fillStyle = "#2a9d8f";
          ctx.beginPath();
          ctx.arc(xB, lineY, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText("B = " + formatCH(markB), xB, lineY - r - 34);
        }

        if (hasA && hasB && measureABEnabled) {
          const xA = valueToX(markA);
          const xB = valueToX(markB);
          const topY = lineY - 70;

          ctx.strokeStyle = "#000";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(xA, topY);
          ctx.lineTo(xB, topY);
          ctx.stroke();

          const dir = xB >= xA ? 1 : -1;
          const arrSize = 8;
          ctx.beginPath();
          ctx.moveTo(xB, topY);
          ctx.lineTo(xB - dir * arrSize, topY - arrSize / 2);
          ctx.lineTo(xB - dir * arrSize, topY + arrSize / 2);
          ctx.closePath();
          ctx.fillStyle = "#000";
          ctx.fill();

          const diffRaw = markB - markA;
          const diff = decimalsEnabled
            ? Math.round(diffRaw * 1000) / 1000
            : Math.round(diffRaw);

          ctx.font = "20px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText("B − A = " + formatCH(diff), (xA + xB) / 2, topY - 0);
        }
      }

      // Info-Text
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = "13px system-ui";
      ctx.fillStyle = "#555";

      const minLabelVal = decimalsEnabled
        ? Math.round(viewMin * 1000) / 1000
        : Math.round(viewMin);
      const maxLabelVal = decimalsEnabled
        ? Math.round(viewMax * 1000) / 1000
        : Math.round(viewMax);

 const infoText = `Sichtbarer Bereich: ${formatCH(minLabelVal)} bis ${formatCH(maxLabelVal)}`;
      ctx.fillText(infoText, PADDING_LEFT, PADDING_TOP - 10);
    }

    function zoom(factor, centerValue) {
      const range = viewMax - viewMin;
      if (range <= 0) return;

      // Bisherige Logik: minRange abhängig vom Weltbereich
      const worldRange = worldMax - worldMin;
      const worldBasedMinRange = worldRange > 0 ? worldRange / 10000 : MIN_VIEW_RANGE;

      // NEU: Niemals kleiner als MIN_VIEW_RANGE (z.B. 0.01),
      // damit majorStep ≈ MIN_UNIT (0.001) bleibt
      const minRange = Math.max(worldBasedMinRange, MIN_VIEW_RANGE);

      let newRange = range / factor;
      if (newRange < minRange) newRange = minRange;

      const c = typeof centerValue === "number" ? centerValue : (viewMin + viewMax) / 2;
      const p = (c - viewMin) / range;
      let newMin = c - p * newRange;
      let newMax = newMin + newRange;

      viewMin = newMin;
      viewMax = newMax;
      drawNumberLine();
    }


    function setCanvasHeight(newHeight) {
      canvasHeight = newHeight;
      if (heightRange) {
        heightRange.value = newHeight;
      }
      if (heightValueLabel) {
        heightValueLabel.textContent = newHeight + " px";
      }
      resizeCanvas();
    }

    // Zentrieren auf Markierungen A/B
    function centerOnMarks() {
      const valA = parseFloat(markAInput.value);
      const valB = parseFloat(markBInput.value);
      const hasA = !isNaN(valA);
      const hasB = !isNaN(valB);

      if (!hasA && !hasB) return;

      let minVal, maxVal;
      if (hasA && hasB) {
        minVal = Math.min(valA, valB);
        maxVal = Math.max(valA, valB);
      } else if (hasA) {
        minVal = maxVal = valA;
      } else {
        minVal = maxVal = valB;
      }

      let range = maxVal - minVal;
      const worldRange = (worldMax - worldMin) || 1;

      if (range < worldRange / 100) {
        range = worldRange / 100;
      }

      let padding = range * 0.3;
      if (padding < worldRange / 200) padding = worldRange / 200;

      viewMin = minVal - padding;
      viewMax = maxVal + padding;
      drawNumberLine();
    }

    // Spotlight-Logik (nur canvasWrapper)
    function enterSpotlight() {
      if (!canvasWrapper || isSpotlight) return;

      spotlightOverlay = document.createElement("div");
      spotlightOverlay.className = "zs-spotlight-overlay";
      Object.assign(spotlightOverlay.style, {
        position: "fixed",
        inset: "0",
        background: "rgba(0, 0, 0, 0.85)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "24px",
        zIndex: "9999"
      });

      if (!canvasWrapper.dataset.originalStyle) {
        canvasWrapper.dataset.originalStyle = canvasWrapper.getAttribute("style") || "";
      }

      canvasWrapper.style.maxWidth = "90vw";
      canvasWrapper.style.width = "100%";
      canvasWrapper.style.background = "#ffffff";
      canvasWrapper.style.borderRadius = "12px";
      canvasWrapper.style.boxShadow = "0 0 40px rgba(0,0,0,0.6)";
      canvasWrapper.style.padding = "16px";

      document.body.appendChild(spotlightOverlay);
      spotlightOverlay.appendChild(canvasWrapper);

      isSpotlight = true;
      if (fullscreenBtn) fullscreenBtn.textContent = "Spotlight beenden";

      resizeCanvas();

      spotlightOverlay.addEventListener("click", (e) => {
        if (e.target === spotlightOverlay) {
          exitSpotlight();
        }
      });

      document.addEventListener("keydown", escHandler);
    }

    function exitSpotlight() {
      if (!canvasWrapper || !isSpotlight) return;

      if (originalWrapperParent) {
        if (originalWrapperNextSibling && originalWrapperNextSibling.parentNode === originalWrapperParent) {
          originalWrapperParent.insertBefore(canvasWrapper, originalWrapperNextSibling);
        } else {
          originalWrapperParent.appendChild(canvasWrapper);
        }
      }

      if (canvasWrapper.dataset.originalStyle !== undefined) {
        const originalStyle = canvasWrapper.dataset.originalStyle;
        if (originalStyle) {
          canvasWrapper.setAttribute("style", originalStyle);
        } else {
          canvasWrapper.removeAttribute("style");
        }
      }

      if (spotlightOverlay && spotlightOverlay.parentNode) {
        spotlightOverlay.parentNode.removeChild(spotlightOverlay);
      }
      spotlightOverlay = null;
      isSpotlight = false;

      if (fullscreenBtn) fullscreenBtn.textContent = "Spotlight";

      document.removeEventListener("keydown", escHandler);

      resizeCanvas();
    }

    function escHandler(e) {
      if (e.key === "Escape" && isSpotlight) {
        exitSpotlight();
      }
    }

    // Events

    window.addEventListener("resize", resizeCanvas);

    if (applyRangeBtn) {
      applyRangeBtn.addEventListener("click", setWorldRangeFromInputs);
    }

    if (applyMarksBtn) {
      applyMarksBtn.addEventListener("click", () => {
        drawNumberLine();
      });
    }

    if (resetMarksBtn) {
      resetMarksBtn.addEventListener("click", () => {
        markAInput.value = "";
        markBInput.value = "";
        drawNumberLine();
      });
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener("click", () => zoom(1.25));
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener("click", () => zoom(1 / 1.25));
    }

    if (toggleDecimalsBtn) {
      toggleDecimalsBtn.addEventListener("click", () => {
        decimalsEnabled = !decimalsEnabled;
        toggleDecimalsBtn.textContent = "Dezimalzahlen: " + (decimalsEnabled ? "AN" : "AUS");
        drawNumberLine();
      });
    }

    if (fullscreenBtn && appContainer) {
      fullscreenBtn.textContent = "Spotlight";
      fullscreenBtn.addEventListener("click", () => {
        if (!isSpotlight) {
          enterSpotlight();
        } else {
          exitSpotlight();
        }
      });
    }







    // NEU: Optionen (zs-controls) ein-/ausblenden
    if (toggleControlsBtn) {
      toggleControlsBtn.addEventListener("click", () => {
        const controls = root.querySelector(".zs-controls");
        if (!controls) return;

        controls.classList.toggle("is-hidden");

        if (controls.classList.contains("is-hidden")) {
          toggleControlsBtn.textContent = "⚙️ Optionen einblenden";
        } else {
          toggleControlsBtn.textContent = "⚙️ Optionen ausblenden";
        }
      });
    }








    if (measureToggleBtn) {
      measureToggleBtn.textContent = "Abstand A–B: AUS";
      measureToggleBtn.classList.remove("is-active");

      measureToggleBtn.addEventListener("click", () => {
        measureABEnabled = !measureABEnabled;
        measureToggleBtn.classList.toggle("is-active", measureABEnabled);
        measureToggleBtn.textContent = measureABEnabled
          ? "Abstand A–B: AN"
          : "Abstand A–B: AUS";
        drawNumberLine();
      });
    }

    // Bereich-Preset-Buttons
    function setRangePreset(min, max) {
      worldMinInput.value = min;
      worldMaxInput.value = max;
      setWorldRangeFromInputs();
    }

    if (rangeBtn100) {
      rangeBtn100.addEventListener("click", () => setRangePreset(0, 100));
    }
    if (rangeBtn1000) {
      rangeBtn1000.addEventListener("click", () => setRangePreset(0, 1000));
    }
    if (rangeBtn10000) {
      rangeBtn10000.addEventListener("click", () => setRangePreset(0, 10000));
    }
    if (rangeBtn100000) {
      rangeBtn100000.addEventListener("click", () => setRangePreset(0, 100000));
    }
    if (rangeBtn1000000) {
               rangeBtn1000000.addEventListener("click", () => setRangePreset(0, 1000000)); // NEU
           }

    // Zentrier-Button
    if (centerMarksBtn) {
      centerMarksBtn.addEventListener("click", centerOnMarks);
    }

    // Label-Modus-Umschalter (alle / jeder 2. / jeder 5.)
    if (labelModeBtn) {
      const modes = [1, 2, 5];
      const texts = {
        1: "Labels: alle",
        2: "Labels: jeder 2.",
        5: "Labels: jeder 5."
      };
      let modeIndex = 0;
      labelSkipMode = modes[modeIndex];
      labelModeBtn.textContent = texts[labelSkipMode];

      labelModeBtn.addEventListener("click", () => {
        modeIndex = (modeIndex + 1) % modes.length;
        labelSkipMode = modes[modeIndex];
        labelModeBtn.textContent = texts[labelSkipMode];
        drawNumberLine();
      });
    }

    // Export als PNG
    if (exportPngBtn) {
      exportPngBtn.addEventListener("click", () => {
        try {
          const dataURL = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.href = dataURL;
          link.download = "zahlenstrahl.png";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (e) {
          console.warn("Export PNG nicht möglich:", e);
        }
      });
    }

    if (heightRange) {
      if (heightValueLabel) {
        heightValueLabel.textContent = canvasHeight + " px";
      }

      heightRange.addEventListener("input", () => {
        const val = parseInt(heightRange.value, 10) || 300;
        setCanvasHeight(val);
      });
    }

    if (btnHeightSmall) {
      btnHeightSmall.addEventListener("click", () => setCanvasHeight(100));
    }
    if (btnHeightMedium) {
      btnHeightMedium.addEventListener("click", () => setCanvasHeight(550));
    }
    if (btnHeightLarge) {
      btnHeightLarge.addEventListener("click", () => setCanvasHeight(1000));
    }

    [worldMinInput, worldMaxInput, markAInput, markBInput].forEach((input) => {
      if (!input) return;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          if (input === worldMinInput || input === worldMaxInput) {
            setWorldRangeFromInputs();
          } else {
            drawNumberLine();
          }
        }
      });
    });

    if (markAInput) {
      markAInput.addEventListener("input", () => {
        drawNumberLine();
      });
    }
    if (markBInput) {
      markBInput.addEventListener("input", () => {
        drawNumberLine();
      });
    }

    // Maus-Drag
    canvas.addEventListener("mousedown", (e) => {
      isDragging = true;
      isTouchDragging = false;
      dragStartX = e.clientX;
      dragStartViewMin = viewMin;
      dragStartViewMax = viewMax;
      didDragSinceMouseDown = false;

      const range = dragStartViewMax - dragStartViewMin;
      const usableWidth = canvas.width - PADDING_LEFT - PADDING_RIGHT;
      if (range > 0 && usableWidth > 0) {
        const pixelsPerUnit = usableWidth / range;
        const steps = computeTickSteps(range, pixelsPerUnit);
        panMajorStep = steps.majorStep;
        panMinorStep = steps.minorStep;
      } else {
        panMajorStep = null;
        panMinorStep = null;
      }
    });

    window.addEventListener("mouseup", () => {
      const wasDragging = isDragging;
      isDragging = false;
      isTouchDragging = false;
      panMajorStep = null;
      panMinorStep = null;
      if (wasDragging) {
        drawNumberLine();
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging || isTouchDragging) return;
      const dx = e.clientX - dragStartX;
      if (Math.abs(dx) > 2) {
        didDragSinceMouseDown = true;
      }
      const range = dragStartViewMax - dragStartViewMin;
      const usableWidth = canvas.width - PADDING_LEFT - PADDING_RIGHT;
      if (usableWidth <= 0) return;
      const unitsPerPixel = range / usableWidth;
      const deltaUnits = dx * unitsPerPixel;

      viewMin = dragStartViewMin - deltaUnits;
      viewMax = dragStartViewMax - deltaUnits;
      schedulePanDraw();
    });

    // Hover über Striche
    canvas.addEventListener("mousemove", (e) => {
      if (isDragging) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const lineY = canvas.height / 2;

      const MAX_DX = 10;
      const MAX_DY = 15;

      let nearestVal = null;
      let bestDist = Infinity;

      for (const t of tickPositions) {
        const dx = Math.abs(t.x - mouseX);
        const dy = Math.abs(lineY - mouseY);
        if (dx <= MAX_DX && dy <= MAX_DY) {
          const dist = Math.hypot(dx, dy);
          if (dist < bestDist) {
            bestDist = dist;
            nearestVal = t.value;
          }
        }
      }

      if (nearestVal !== null) {
        if (hoverValue !== nearestVal) {
          hoverValue = nearestVal;
          drawNumberLine();
        }
      } else {
        if (hoverValue !== null) {
          hoverValue = null;
          drawNumberLine();
        }
      }
    });

    canvas.addEventListener("mouseleave", () => {
      if (hoverValue !== null) {
        hoverValue = null;
        drawNumberLine();
      }
    });

    // Klick setzt / entfernt A oder B
    canvas.addEventListener("click", (e) => {
      if (didDragSinceMouseDown) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const lineY = canvas.height / 2;

      const MAX_DY = 40;
      if (Math.abs(mouseY - lineY) > MAX_DY) return;

      let snappedVal = null;
      let bestDx = Infinity;
      for (const t of tickPositions) {
        const dx = Math.abs(t.x - mouseX);
        if (dx < bestDx && dx <= 15) {
          bestDx = dx;
          snappedVal = t.value;
        }
      }

      let value = snappedVal !== null ? snappedVal : xToValue(mouseX);

      if (!decimalsEnabled) {
        value = Math.round(value);
      } else {
        value = Math.round(value * 1000) / 1000;
      }

      const tol = decimalsEnabled ? 1e-3 : 0.01;

      const currentA = parseFloat(markAInput.value);
      const currentB = parseFloat(markBInput.value);
      const hasA = !isNaN(currentA);
      const hasB = !isNaN(currentB);

      if (hasA && Math.abs(currentA - value) <= tol) {
        markAInput.value = "";
        drawNumberLine();
        return;
      }

      if (hasB && Math.abs(currentB - value) <= tol) {
        markBInput.value = "";
        drawNumberLine();
        return;
      }

      if (!hasA && !hasB) {
        markAInput.value = value;
        drawNumberLine();
        return;
      }

      if (hasA && !hasB) {
        markBInput.value = value;
        drawNumberLine();
        return;
      }

      if (!hasA && hasB) {
        markAInput.value = value;
        drawNumberLine();
        return;
      }

      // A und B beide gesetzt, andere Zahl → nichts tun
    });

    // Doppelklick ausserhalb des Zahlenstrahls → Reset
    canvas.addEventListener("dblclick", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const lineY = canvas.height / 2;

      const left = PADDING_LEFT;
      const right = canvas.width - PADDING_RIGHT;
      const withinX = mouseX >= left && mouseX <= right;

      const ON_LINE_DY = 40;
      const isNearLine = withinX && Math.abs(mouseY - lineY) <= ON_LINE_DY;

      if (!isNearLine) {
        resetViewToWorld();
      }
    });

    // Touch-Unterstützung: Pan + Pinch-Zoom
    function handleTouchStart(e) {
      if (!e.touches.length) return;
      e.preventDefault();

      if (e.touches.length === 1) {
        const t = e.touches[0];
        isDragging = true;
        isTouchDragging = true;
        isPinchZoom = false;
        dragStartX = t.clientX;
        dragStartViewMin = viewMin;
        dragStartViewMax = viewMax;
        didDragSinceMouseDown = false;

        const range = dragStartViewMax - dragStartViewMin;
        const usableWidth = canvas.width - PADDING_LEFT - PADDING_RIGHT;
        if (range > 0 && usableWidth > 0) {
          const pixelsPerUnit = usableWidth / range;
          const steps = computeTickSteps(range, pixelsPerUnit);
          panMajorStep = steps.majorStep;
          panMinorStep = steps.minorStep;
        } else {
          panMajorStep = null;
          panMinorStep = null;
        }
      } else if (e.touches.length === 2) {
        isDragging = false;
        isTouchDragging = false;
        isPinchZoom = true;

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        lastPinchDist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY
        );

        const rect = canvas.getBoundingClientRect();
        const centerX = ((t1.clientX + t2.clientX) / 2) - rect.left;
        pinchCenterValue = xToValue(centerX);
      }
    }

    function handleTouchMove(e) {
      if (!e.touches.length) return;
      e.preventDefault();

      if (isTouchDragging && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - dragStartX;
        if (Math.abs(dx) > 2) {
          didDragSinceMouseDown = true;
        }
        const range = dragStartViewMax - dragStartViewMin;
        const usableWidth = canvas.width - PADDING_LEFT - PADDING_RIGHT;
        if (usableWidth <= 0) return;
        const unitsPerPixel = range / usableWidth;
        const deltaUnits = dx * unitsPerPixel;

        viewMin = dragStartViewMin - deltaUnits;
        viewMax = dragStartViewMax - deltaUnits;
        schedulePanDraw();
      } else if (isPinchZoom && e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY
        );
        if (!lastPinchDist) {
          lastPinchDist = dist;
          return;
        }
        const factor = dist / lastPinchDist;
        if (Math.abs(factor - 1) > 0.01) {
          zoom(factor, pinchCenterValue);
          lastPinchDist = dist;
        }
      }
    }

    function handleTouchEnd(e) {
      if (e.touches.length === 0) {
        // alles losgelassen
        isDragging = false;
        isTouchDragging = false;
        isPinchZoom = false;
        panMajorStep = null;
        panMinorStep = null;
        lastPinchDist = null;
        pinchCenterValue = null;
        drawNumberLine();
      } else if (e.touches.length === 1) {
        // von 2 Fingern zurück zu 1 Finger → neuen Pan starten
        isPinchZoom = false;
        const t = e.touches[0];
        isDragging = true;
        isTouchDragging = true;
        dragStartX = t.clientX;
        dragStartViewMin = viewMin;
        dragStartViewMax = viewMax;
        didDragSinceMouseDown = false;

        const range = dragStartViewMax - dragStartViewMin;
        const usableWidth = canvas.width - PADDING_LEFT - PADDING_RIGHT;
        if (range > 0 && usableWidth > 0) {
          const pixelsPerUnit = usableWidth / range;
          const steps = computeTickSteps(range, pixelsPerUnit);
          panMajorStep = steps.majorStep;
          panMinorStep = steps.minorStep;
        } else {
          panMajorStep = null;
          panMinorStep = null;
        }
      }
    }

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", handleTouchEnd, { passive: false });

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const direction = e.deltaY > 0 ? -1 : 1;
        const factor = direction > 0 ? 1.25 : 1 / 1.25;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const valueAtMouse = xToValue(mouseX);

        zoom(factor, valueAtMouse);
      },
      { passive: false }
    );

    // Initial
    setWorldRangeFromInputs();
    resizeCanvas();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".zahlenstrahl-app").forEach(setupZahlenstrahlApp);
  });
})();
