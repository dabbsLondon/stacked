import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Point, Slice } from '../types';
import type { Profile } from '../engine/profile';
import { BRIDGE_COLOR, gradColor } from '../engine/profile';

interface Props {
  points: Point[];
  profile: Profile;
  slices?: Slice[];
  activeSliceId?: string | null;
  slicePointsFor?: (slice: Slice) => Point[];
}

export function Map({
  points,
  profile,
  slices,
  activeSliceId,
  slicePointsFor,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
    }).setView([54.5, -2.5], 6);

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    ).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    if (points.length < 2 || profile.segments.length === 0) return;

    const allLatLngs: L.LatLngExpression[] = points.map((p) => [p.lat, p.lon]);

    // Per-bucket coloured polyline so the map line reflects gradient.
    for (const b of profile.buckets) {
      const slice = points.slice(b.startIdx, b.endIdx + 1);
      if (slice.length < 2) continue;
      const latlngs: L.LatLngExpression[] = slice.map((p) => [p.lat, p.lon]);
      const seg = profile.segments[b.segmentIdx];
      const isBridge = b.kind === 'bridge';
      const polyline = L.polyline(latlngs, {
        color: isBridge ? BRIDGE_COLOR : gradColor(b.gradient),
        weight: 4,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: isBridge ? '8 6' : undefined,
      });
      if (isBridge) {
        polyline.bindTooltip(
          `<div class="map-tt">
            <div class="mono map-tt-num">BRIDGE</div>
            <div class="map-tt-name">${seg.distanceKm.toFixed(2)}km · ${seg.avgGradient.toFixed(1)}%</div>
          </div>`,
          { sticky: true, direction: 'top', opacity: 1, className: 'map-tooltip' },
        );
      } else {
        polyline.bindTooltip(
          `<div class="map-tt">
            <div class="mono map-tt-num">${String((seg.climbIdx ?? 0) + 1).padStart(2, '0')} · CLIMB</div>
            <div class="map-tt-name">${escapeHtml(seg.name)}</div>
            <div class="mono map-tt-stat">
              ${seg.distanceKm.toFixed(1)}km · +${Math.round(seg.ascentM)}m
            </div>
            <div class="mono map-tt-grad">
              avg ${seg.avgGradient.toFixed(1)}% · min ${seg.minGradient.toFixed(0)}% · max ${seg.maxGradient.toFixed(0)}%
            </div>
            <div class="mono map-tt-here">here: ${b.gradient.toFixed(0)}%</div>
          </div>`,
          { sticky: true, direction: 'top', opacity: 1, className: 'map-tooltip' },
        );
      }
      polyline.addTo(layer);
    }

    // Junction markers at each climb start (skip bridges and the very first climb).
    for (let i = 1; i < profile.segments.length; i++) {
      const seg = profile.segments[i];
      if (seg.kind !== 'climb') continue;
      const j = points[seg.startIdx];
      L.circleMarker([j.lat, j.lon], {
        radius: 5,
        color: '#0a0a0c',
        weight: 2,
        fillColor: '#ff5f1f',
        fillOpacity: 1,
      })
        .bindTooltip(`junction → ${escapeHtml(seg.name)}`, {
          direction: 'top',
          className: 'map-tooltip',
        })
        .addTo(layer);
    }

    // Slice overlays — drawn on top of the gradient line.
    if (slices && slicePointsFor) {
      for (let i = 0; i < slices.length; i++) {
        const slc = slices[i];
        const sPts = slicePointsFor(slc);
        if (sPts.length < 2) continue;
        const sLatLngs: L.LatLngExpression[] = sPts.map((p) => [p.lat, p.lon]);
        const active = slc.id === activeSliceId;
        L.polyline(sLatLngs, {
          color: active ? '#ff5f1f' : '#ffae87',
          weight: active ? 7 : 5,
          opacity: active ? 1 : 0.85,
          lineCap: 'round',
          lineJoin: 'round',
        })
          .bindTooltip(
            `<div class="map-tt">
              <div class="mono map-tt-num">${String(i + 1).padStart(2, '0')} · SLICE</div>
              <div class="map-tt-name">${escapeHtml(slc.name)}</div>
              <div class="mono map-tt-stat">
                ${slc.kmStart.toFixed(2)} → ${slc.kmEnd.toFixed(2)} km
              </div>
            </div>`,
            { sticky: true, direction: 'top', opacity: 1, className: 'map-tooltip' },
          )
          .addTo(layer);

        // Slice endpoints on the map
        const sStart = sPts[0];
        const sEnd = sPts[sPts.length - 1];
        L.circleMarker([sStart.lat, sStart.lon], {
          radius: 4,
          color: '#0a0a0c',
          weight: 2,
          fillColor: active ? '#ff5f1f' : '#ffae87',
          fillOpacity: 1,
        }).addTo(layer);
        L.circleMarker([sEnd.lat, sEnd.lon], {
          radius: 4,
          color: '#0a0a0c',
          weight: 2,
          fillColor: active ? '#ff5f1f' : '#ffae87',
          fillOpacity: 1,
        }).addTo(layer);
      }
    }

    // Start / finish.
    const start = points[0];
    const end = points[points.length - 1];
    L.circleMarker([start.lat, start.lon], {
      radius: 7,
      color: '#0a0a0c',
      weight: 2,
      fillColor: '#5eead4',
      fillOpacity: 1,
    })
      .bindTooltip('start', { direction: 'top', className: 'map-tooltip' })
      .addTo(layer);
    L.circleMarker([end.lat, end.lon], {
      radius: 7,
      color: '#0a0a0c',
      weight: 2,
      fillColor: '#fff200',
      fillOpacity: 1,
    })
      .bindTooltip('finish', { direction: 'top', className: 'map-tooltip' })
      .addTo(layer);

    const bounds = L.latLngBounds(allLatLngs);
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
    requestAnimationFrame(() => map.invalidateSize());
  }, [points, profile, slices, activeSliceId, slicePointsFor]);

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map" />
      {points.length >= 2 && (
        <div className="map-badge mono">SYNTHETIC ROUTE</div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
