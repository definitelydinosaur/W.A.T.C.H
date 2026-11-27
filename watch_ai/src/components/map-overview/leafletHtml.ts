export const LEAFLET_MAP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
  />
  <style>
    html, body, #map {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #111827;
      overflow: hidden;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    .leaflet-container {
      background: #111827;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .watch-div-icon {
      background: transparent;
      border: 0;
    }
    .watch-teardrop {
      width: 22px;
      height: 22px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2.5px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.55);
      box-sizing: border-box;
    }
    .watch-hazard-pin {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 3px solid #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      line-height: 1;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
      box-sizing: border-box;
      transition: transform 0.15s ease;
    }
    .watch-hazard-pin.is-selected {
      width: 40px;
      height: 40px;
      font-size: 19px;
      border-color: #111827;
      transform: scale(1.08);
    }
    .watch-hazard-pin.is-archived {
      opacity: 0.58;
      filter: grayscale(0.35);
    }
    .watch-cluster-pin {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #1F2937;
      border: 3px solid #ffffff;
      color: #ffffff;
      font-weight: 700;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.55);
      box-sizing: border-box;
    }
    .watch-cluster-pin.is-archived {
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function () {
      var CDN_SETS = [
        {
          css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
          js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        },
        {
          css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
          js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'
        }
      ];

      var map = null;
      var currentStyleKey = null;
      var baseLayers = [];
      var selectedMarker = null;
      var hazardsLayer = null;
      var areasLayer = null;
      var markersLayer = null;

      var pendingState = null;
      var pendingFlyTo = null;
      var pendingFitBounds = null;

      function post(payload) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          }
        } catch (_err) {}
      }

      function escapeHtml(text) {
        return String(text || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function setTileStyle(styleKey) {
        if (!map || !window.L) return;
        var nextKey = styleKey || 'streets';
        if (currentStyleKey === nextKey && baseLayers.length > 0) return;
        currentStyleKey = nextKey;

        for (var i = 0; i < baseLayers.length; i++) {
          map.removeLayer(baseLayers[i]);
        }
        baseLayers = [];

        if (nextKey === 'dark') {
          baseLayers.push(
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
              subdomains: 'abcd',
              maxNativeZoom: 19,
              maxZoom: 20
            }).addTo(map)
          );
        } else if (nextKey === 'satellite') {
          baseLayers.push(
            L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
              maxNativeZoom: 19,
              maxZoom: 20
            }).addTo(map)
          );
        } else if (nextKey === 'hybrid') {
          baseLayers.push(
            L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
              maxNativeZoom: 19,
              maxZoom: 20
            }).addTo(map)
          );
          baseLayers.push(
            L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
              maxNativeZoom: 19,
              maxZoom: 20
            }).addTo(map)
          );
        } else {
          baseLayers.push(
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxNativeZoom: 19,
              maxZoom: 20
            }).addTo(map)
          );
        }
      }

      function applyState(state) {
        if (!map || !window.L || !state) return;

        setTileStyle(state.mapStyle);

        if (state.center) {
          var icon = L.divIcon({
            className: 'watch-div-icon',
            html: '<div class="watch-teardrop" style="background:#7C3AED;"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 22]
          });
          if (!selectedMarker) {
            selectedMarker = L.marker([state.center.latitude, state.center.longitude], {
              icon: icon,
              zIndexOffset: 300
            }).addTo(map);
          } else {
            selectedMarker.setLatLng([state.center.latitude, state.center.longitude]);
          }
          if (state.center.label) {
            selectedMarker.bindTooltip(escapeHtml(state.center.label), { direction: 'top', offset: [0, -18] });
          }
        }

        hazardsLayer.clearLayers();
        var weatherHazards = state.weatherHazards || [];
        for (var i = 0; i < weatherHazards.length; i++) {
          (function (h) {
            L.circle([h.latitude, h.longitude], {
              radius: h.radius,
              color: h.color,
              weight: 2,
              opacity: 0.9,
              fillColor: h.color,
              fillOpacity: 0.14,
              interactive: false
            }).addTo(hazardsLayer);

            L.circle([h.latitude, h.longitude], {
              radius: Math.round(h.radius * 0.45),
              stroke: false,
              fillColor: h.color,
              fillOpacity: 0.28,
              interactive: false
            }).addTo(hazardsLayer);

            var pinIcon = L.divIcon({
              className: 'watch-div-icon',
              html: '<div class="watch-teardrop" style="background:' + escapeHtml(h.color) + ';"></div>',
              iconSize: [22, 22],
              iconAnchor: [11, 22]
            });

            var m = L.marker([h.latitude, h.longitude], {
              icon: pinIcon,
              zIndexOffset: 200
            }).addTo(hazardsLayer);

            m.on('click', function (ev) {
              L.DomEvent.stopPropagation(ev);
              post({ type: 'hazardPress', id: h.id });
            });
          })(weatherHazards[i]);
        }

        areasLayer.clearLayers();
        var dim = state.historyArchived ? 0.72 : 1;
        var areas = state.areas || [];
        for (var j = 0; j < areas.length; j++) {
          (function (area) {
            var selected = !!area.selected;
            var onAreaClick = function (ev) {
              L.DomEvent.stopPropagation(ev);
              post({ type: 'historySelect', id: area.id });
            };

            if (area.rings && area.rings.length > 0) {
              for (var r = 0; r < area.rings.length; r++) {
                var ring = area.rings[r];
                if (selected) {
                  L.polygon(ring, {
                    stroke: true,
                    color: '#FFFFFF',
                    weight: 6,
                    opacity: 0.85,
                    fill: false,
                    interactive: false
                  }).addTo(areasLayer);
                }
                var poly = L.polygon(ring, {
                  color: area.color,
                  weight: selected ? 3.5 : 2.2,
                  opacity: 0.94 * dim,
                  fillColor: area.color,
                  fillOpacity: (selected ? 0.44 : 0.24) * dim
                }).addTo(areasLayer);
                poly.on('click', onAreaClick);
              }
            } else if (area.circleRadius) {
              var c = L.circle([area.latitude, area.longitude], {
                radius: area.circleRadius,
                color: area.color,
                weight: selected ? 3.5 : 2.2,
                opacity: 0.94 * dim,
                fillColor: area.color,
                fillOpacity: (selected ? 0.44 : 0.24) * dim
              }).addTo(areasLayer);
              c.on('click', onAreaClick);
            }

            if (area.line && area.line.length >= 2) {
              var hasRings = area.rings && area.rings.length > 0;
              if (!hasRings) {
                var casing = L.polyline(area.line, {
                  color: '#FFFFFF',
                  weight: selected ? 13 : 11,
                  opacity: 0.88 * dim,
                  lineCap: 'round',
                  lineJoin: 'round'
                }).addTo(areasLayer);
                casing.on('click', onAreaClick);
              }
              var road = L.polyline(area.line, {
                color: area.color,
                weight: hasRings ? (selected ? 5 : 3.5) : (selected ? 9 : 6),
                opacity: (hasRings ? 0.88 : 1) * dim,
                lineCap: 'round',
                lineJoin: 'round'
              }).addTo(areasLayer);
              road.on('click', onAreaClick);
            }
          })(areas[j]);
        }

        markersLayer.clearLayers();
        var markers = state.markers || [];
        for (var k = 0; k < markers.length; k++) {
          (function (item) {
            if (item.kind === 'cluster') {
              var clusterClass = 'watch-cluster-pin' + (state.historyArchived ? ' is-archived' : '');
              var clusterIcon = L.divIcon({
                className: 'watch-div-icon',
                html: '<div class="' + clusterClass + '">' + escapeHtml(item.count) + '</div>',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
              });
              var cm = L.marker([item.latitude, item.longitude], {
                icon: clusterIcon,
                zIndexOffset: 250
              }).addTo(markersLayer);
              cm.on('click', function (ev) {
                L.DomEvent.stopPropagation(ev);
                var nextZoom = Math.min(Math.round(map.getZoom()) + 2, 16);
                map.flyTo([item.latitude, item.longitude], nextZoom, { duration: 0.5 });
              });
            } else {
              var size = item.selected ? 40 : 34;
              var half = size / 2;
              var pinClass =
                'watch-hazard-pin' +
                (item.selected ? ' is-selected' : '') +
                (state.historyArchived ? ' is-archived' : '');
              var hIcon = L.divIcon({
                className: 'watch-div-icon',
                html:
                  '<div class="' +
                  pinClass +
                  '" style="background:' +
                  escapeHtml(item.color) +
                  ';">' +
                  escapeHtml(item.glyph) +
                  '</div>',
                iconSize: [size, size],
                iconAnchor: [half, half]
              });
              var hm = L.marker([item.latitude, item.longitude], {
                icon: hIcon,
                zIndexOffset: item.selected ? 400 : 220
              }).addTo(markersLayer);
              hm.on('click', function (ev) {
                L.DomEvent.stopPropagation(ev);
                post({ type: 'historySelect', id: item.id });
              });
            }
          })(markers[k]);
        }
      }

      window.__WATCH_UPDATE__ = function (state) {
        if (!map || !window.L) {
          pendingState = state;
          return;
        }
        applyState(state);
      };

      window.__WATCH_FLY_TO__ = function (lat, lon, zoom) {
        if (!map || !window.L) {
          pendingFlyTo = [lat, lon, zoom];
          return;
        }
        map.flyTo([lat, lon], zoom, { duration: 0.65 });
      };

      window.__WATCH_FIT_BOUNDS__ = function (minLat, minLon, maxLat, maxLon) {
        if (!map || !window.L) {
          pendingFitBounds = [minLat, minLon, maxLat, maxLon];
          return;
        }
        map.fitBounds(
          [
            [minLat, minLon],
            [maxLat, maxLon]
          ],
          {
            paddingTopLeft: [48, 130],
            paddingBottomRight: [48, 260],
            maxZoom: 15,
            animate: true,
            duration: 0.75
          }
        );
      };

      function initMap() {
        map = L.map('map', {
          zoomControl: false,
          attributionControl: false,
          maxZoom: 20,
          minZoom: 3
        }).setView([10.3157, 123.8854], 14);

        hazardsLayer = L.layerGroup().addTo(map);
        areasLayer = L.layerGroup().addTo(map);
        markersLayer = L.layerGroup().addTo(map);

        setTileStyle('streets');

        map.on('zoomend', function () {
          post({ type: 'zoom', zoom: map.getZoom() });
        });

        map.on('click', function () {
          post({ type: 'historySelect', id: null });
        });

        if (pendingState) {
          applyState(pendingState);
          pendingState = null;
        }
        if (pendingFlyTo) {
          map.flyTo([pendingFlyTo[0], pendingFlyTo[1]], pendingFlyTo[2], { duration: 0.65 });
          pendingFlyTo = null;
        }
        if (pendingFitBounds) {
          window.__WATCH_FIT_BOUNDS__(
            pendingFitBounds[0],
            pendingFitBounds[1],
            pendingFitBounds[2],
            pendingFitBounds[3]
          );
          pendingFitBounds = null;
        }

        post({ type: 'ready' });
      }

      function loadLeaflet(index) {
        if (index >= CDN_SETS.length) {
          post({ type: 'error', message: 'Unable to load OpenStreetMap Leaflet assets.' });
          return;
        }
        var cdn = CDN_SETS[index];
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cdn.css;
        document.head.appendChild(link);

        var script = document.createElement('script');
        script.src = cdn.js;
        script.async = true;
        script.onload = function () {
          if (window.L) {
            initMap();
          } else {
            loadLeaflet(index + 1);
          }
        };
        script.onerror = function () {
          loadLeaflet(index + 1);
        };
        document.head.appendChild(script);
      }

      loadLeaflet(0);
    })();
  </script>
</body>
</html>`;
