'use client';
/**
 * The map and the drawing tools. MapLibre draws the basemap (tiles come through
 * our own proxy, so no key is in the page); Terra Draw handles polygon,
 * rectangle and freehand drawing and corner editing.
 *
 * The parent owns what the area *means*. This component only reports the
 * drawn shapes (WGS84 GeoJSON) and can be told where to look.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import type { Position } from '@/lib/prospectpv/mapArea';

export type DrawTool = 'polygon' | 'rectangle' | 'freehand' | 'select';
export type DrawnShapes = { type: 'MultiPolygon'; coordinates: Position[][][] } | null;

export type AreaMapHandle = {
  flyTo(lng: number, lat: number, zoom?: number): void;
  setTool(t: DrawTool): void;
  clear(): void;
  /** Replaces the drawing, for an uploaded area. */
  load(geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }): void;
  deleteSelected(): void;
};

type Props = {
  center: [number, number];
  zoom: number;
  /** Tile URL template; points at the server proxy. */
  tileUrl: string;
  /** False in tests, where no tile server is available. */
  showTiles?: boolean;
  onChange(shapes: DrawnShapes): void;
  onToolChange?(t: DrawTool): void;
};

const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';
const GOLD = '#F8BC1E' as const;
const INK = '#14201C' as const;

export const AreaMap = forwardRef<AreaMapHandle, Props>(function AreaMap({ center, zoom, tileUrl, showTiles = true, onChange, onToolChange }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{ map: import('maplibre-gl').Map; draw: import('terra-draw').TerraDraw } | null>(null);
  const cb = useRef({ onChange, onToolChange });
  cb.current = { onChange, onToolChange };
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const [maplibregl, td, { TerraDrawMapLibreGLAdapter }] = await Promise.all([
          import('maplibre-gl'),
          import('terra-draw'),
          import('terra-draw-maplibre-gl-adapter'),
        ]);
        if (dead || !el.current) return;

        // MapLibre's worker is served from /maplibre/ (scripts/copy-maplibre.mjs); a bundler does not emit it.
        maplibregl.setWorkerUrl(WORKER_URL);

        const map = new maplibregl.Map({
          container: el.current,
          center,
          zoom,
          maxZoom: 19,
          attributionControl: { compact: true },
          style: {
            version: 8,
            sources: showTiles
              ? { os: { type: 'raster', tiles: [tileUrl], tileSize: 256, maxzoom: 19, attribution: 'Contains OS data © Crown copyright and database rights' } }
              : {},
            layers: showTiles ? [{ id: 'os', type: 'raster', source: 'os' }] : [{ id: 'bg', type: 'background', paint: { 'background-color': '#EDE7D8' } }],
          },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

        const fill = { fillColor: GOLD, fillOpacity: 0.28, outlineColor: INK, outlineWidth: 3 };
        const draw = new td.TerraDraw({
          adapter: new TerraDrawMapLibreGLAdapter({ map }),
          modes: [
            new td.TerraDrawPolygonMode({ styles: { ...fill, closingPointColor: GOLD, closingPointOutlineColor: INK } }),
            new td.TerraDrawRectangleMode({ styles: fill }),
            new td.TerraDrawFreehandMode({ styles: { ...fill, closingPointColor: GOLD, closingPointOutlineColor: INK } }),
            new td.TerraDrawSelectMode({
              flags: {
                polygon: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } },
                rectangle: { feature: { draggable: true, coordinates: { midpoints: false, draggable: true, resizable: 'opposite' } } },
                freehand: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } },
              },
              styles: { selectedPolygonColor: GOLD, selectedPolygonFillOpacity: 0.28, selectedPolygonOutlineColor: INK, selectionPointColor: GOLD, selectionPointOutlineColor: INK, midPointColor: INK },
            }),
          ],
        });

        const report = () => {
          const polys = draw.getSnapshot().filter((f) => f.geometry.type === 'Polygon' && f.properties?.mode !== 'select');
          cb.current.onChange(
            polys.length ? { type: 'MultiPolygon', coordinates: polys.map((f) => (f.geometry as unknown as { coordinates: Position[][] }).coordinates) } : null,
          );
        };

        map.on('load', () => {
          if (dead) return;
          draw.start();
          draw.setMode('polygon');
          cb.current.onToolChange?.('polygon');
          // A shape finished in a drawing mode drops straight into select mode so corners can be adjusted.
          draw.on('finish', (id, ctx) => {
            report();
            if (ctx.action === 'draw') { draw.setMode('select'); draw.selectFeature(id); cb.current.onToolChange?.('select'); }
          });
          draw.on('change', (_ids, type) => { if (type !== 'styling') report(); });
          api.current = { map, draw };
          (el.current as HTMLElement & { __ready?: boolean }).__ready = true;
          el.current?.setAttribute('data-ready', 'true');
        });
        map.on('error', (e: { error?: { message?: string } }) => {
          if (showTiles && /tile|403|401|502|503/i.test(String(e?.error?.message ?? ''))) setFailed('The map tiles can’t be loaded right now. You can still search for a postcode and draw, but you won’t see the streets.');
        });

        cleanup = () => {
          try { draw.stop(); } catch { /* already stopped */ }
          map.remove();
          api.current = null;
        };
        if (dead) cleanup();
      } catch (e) {
        console.error('[prospectpv] map failed to start', e);
        setFailed('The map couldn’t start in this browser.');
      }
    })();
    return () => { dead = true; cleanup?.(); };
    // The map is created once; props that change later are handled through the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    flyTo: (lng, lat, z = 17) => api.current?.map.flyTo({ center: [lng, lat], zoom: z, essential: false }),
    setTool: (t) => { api.current?.draw.setMode(t); cb.current.onToolChange?.(t); },
    clear: () => { api.current?.draw.clear(); cb.current.onChange(null); },
    load: (g) => {
      const d = api.current?.draw;
      if (!d) return;
      d.clear();
      const rings = g.type === 'Polygon' ? [g.coordinates as Position[][]] : (g.coordinates as Position[][][]);
      d.addFeatures(rings.map((c) => ({ type: 'Feature', properties: { mode: 'polygon' }, geometry: { type: 'Polygon', coordinates: c } })));
      const all = rings.flat(2);
      if (all.length) {
        const lngs = all.map((p) => p[0]); const lats = all.map((p) => p[1]);
        api.current?.map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, animate: false });
      }
      d.setMode('select');
      cb.current.onToolChange?.('select');
    },
    deleteSelected: () => {
      const d = api.current?.draw;
      if (!d) return;
      for (const f of d.getSnapshot()) if (f.properties?.selected) d.removeFeatures([f.id as string]);
    },
  }));

  return (
    <div className="pvm-map-wrap">
      <div ref={el} className="pvm-map" role="application" aria-label="Map. Use the drawing tools above, or search for a postcode." tabIndex={-1} />
      {failed ? <p className="pvm-map-fail" role="status">{failed}</p> : null}
    </div>
  );
});
