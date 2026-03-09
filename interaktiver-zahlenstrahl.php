<?php
/**
 * Plugin Name: Interaktiver Zahlenstrahl Shortcode
 * Description: Stellt einen interaktiven, zoombaren Zahlenstrahl per Shortcode [zahlenstrahl] zur Verfügung.
 * Version: 1.0.0
 * Author: Remo Lepori
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// CSS & JS registrieren
add_action( 'wp_enqueue_scripts', function () {
    $url = plugin_dir_url( __FILE__ );
    wp_register_style(
        'izs-style',
        $url . 'assets/css/izs-style.css',
        [],
        '1.0.0'
    );
    wp_register_script(
        'izs-script',
        $url . 'assets/js/izs-script.js',
        [],
        '1.0.0',
        true
    );
});

// Shortcode [zahlenstrahl]
function izs_render_shortcode( $atts = [], $content = null ) {
    wp_enqueue_style( 'izs-style' );
    wp_enqueue_script( 'izs-script' );

    ob_start();
    ?>
    <div class="zahlenstrahl-app">
      <div class="zs-header">
        <h2>Interaktiver Zahlenstrahl</h2>

 	<button class="btn zs-toggle-controls">⚙️ Optionen ausblenden</button>

        <div class="zs-size-control">
          <span class="zs-size-label">Höhe des Zahlenstrahls: </span>
          <input type="range" class="zs-height-range" min="100" max="1000" value="300">
          <button class="btn zs-height-small">mind.</button>
          <button class="btn zs-height-medium">mittel</button>
          <button class="btn zs-height-large">max.</button>
        </div>

        <button class="btn zs-fullscreen-btn">Spotlight</button>
      </div>

      <div class="zs-app-container">
        <div class="zs-controls">
          <div class="zs-controls-row">
            <div class="zs-control-group zs-control-group-small">
              <label>Von</label>
              <input type="number" class="zs-input-min" value="0" />
            </div>
            <div class="zs-control-group zs-control-group-small">
              <label>Bis</label>
              <input type="number" class="zs-input-max" value="1000" />
            </div>
            <button class="btn zs-apply-range">Bereich anzeigen</button>

            <!-- NEU: Bereichs-Preset-Buttons -->
            <div class="zs-control-group">
              <label>Schnellbereiche</label>
              <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
                <button class="btn zs-range-100">0 – 100</button>
                <button class="btn zs-range-1000">0 – 1'000</button>
                <button class="btn zs-range-10000">0 – 10'000</button>
                <button class="btn zs-range-100000">0 – 100'000</button>
		<button class="btn zs-range-1000000">0 – 1'000'000</button>
              </div>
            </div>
          </div>

          <div class="zs-controls-row">
            <div class="zs-control-group zs-control-group-small">
              <label>Markierung A</label>
              <input type="number" class="zs-input-markA" placeholder="z.B. 230" />
            </div>
            <div class="zs-control-group zs-control-group-small">
              <label>Markierung B</label>
              <input type="number" class="zs-input-markB" placeholder="z.B. 570" />
            </div>
            <button class="btn zs-apply-marks">Markierung setzen</button>
            <button class="btn zs-reset-marks">Markierungen löschen</button>
            <!-- NEU: A/B zentrieren -->
            <button class="btn zs-center-marks">A/B zentrieren</button>
            <!-- Messwerkzeug (Klasse existiert schon, JS ändert Text) -->
            <button class="btn zs-measure-toggle">Abstand messen</button>
          </div>

          <div class="zs-controls-row">
            <span class="zs-label-small">Zoom:</span>
            <button class="btn zs-zoom-in">🔍➕</button>
            <button class="btn zs-zoom-out">🔍➖</button>
            <span class="zs-hint-small">(Mausrad oder Pinch über dem Zahlenstrahl = Zoom)</span>



            <!-- NEU: Label-Modus-Umschalter -->
            <button class="btn zs-label-mode">Labels: alle</button>

            <button class="btn zs-toggle-decimals">Dezimalzahlen: AUS</button>

            <!-- NEU: Export als PNG -->
            <button class="btn zs-export-png">Als PNG speichern</button>
          </div>
        </div>

        <div class="zs-canvas-wrapper">
          <div class="zs-info-text">
            Tipp: Wähle zuerst einen Bereich (z.B. 0–1000). Dann kannst du mit dem Mausrad,
            Touch-Gesten oder den Zoom-Buttons hineinzoomen. Strichabstände und Beschriftungen passen
            sich automatisch an. Mit dem Button <b>Dezimalzahlen</b> kannst du ganze Zahlen
            oder Dezimalzahlen anzeigen lassen. Mit <b>Abstand A–B</b> kannst du die Distanz
            zwischen zwei Markierungen ein- oder ausblenden.
          </div>
          <canvas class="zs-canvas"></canvas>
        </div>
      </div>
    </div>
    <?php
    return ob_get_clean();
}
add_shortcode( 'zahlenstrahl', 'izs_render_shortcode' );
