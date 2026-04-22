import { useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Save } from "@workspace/api-client-react";

interface MarkerClusterLike {
  getAllChildMarkers(): L.Marker[];
  getChildCount(): number;
}

function toFlag(code: string): string {
  return Array.from(code.toUpperCase())
    .map(l => String.fromCodePoint(l.charCodeAt(0) - 65 + 0x1F1E6))
    .join("");
}

function numberedMarkerIcon(num: number, selected: boolean): L.DivIcon {
  const bg = selected ? "#6b7c46" : "#3d3d34";
  const border = selected ? "#b8a97a" : "white";
  const shadow = selected
    ? "0 0 0 3px #b8a97a, 0 3px 10px rgba(0,0,0,0.35)"
    : "0 2px 6px rgba(0,0,0,0.3)";
  return L.divIcon({
    html: `<div style="
      width: 30px; height: 30px; border-radius: 50%;
      background: ${bg};
      color: white; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      box-shadow: ${shadow};
      border: 2px solid ${border};
      font-family: system-ui, -apple-system, sans-serif;
      cursor: pointer;
      transition: transform 0.15s;
    ">${num}</div>`,
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

interface SavesMapProps {
  saves: Save[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}

export function SavesMap({ saves, selectedIds, onToggle }: SavesMapProps) {
  const markerSaveMap = useRef(new Map<L.Marker, Save>());

  const geocodedSaves = saves.filter(s => s.lat != null && s.lng != null);

  const createClusterIcon = (cluster: MarkerClusterLike): L.DivIcon => {
    const markers = cluster.getAllChildMarkers() as L.Marker[];
    const savesInCluster = markers
      .map(m => markerSaveMap.current.get(m))
      .filter((s): s is Save => s != null);

    const countryCodes = new Set(
      savesInCluster.map(s => s.countryCode).filter((c): c is string => !!c)
    );
    const count = cluster.getChildCount();
    const singleCode = countryCodes.size === 1 ? [...countryCodes][0]! : null;
    const label = singleCode ? `${toFlag(singleCode)} ${count}` : `🌍 ${count}`;

    return L.divIcon({
      html: `<div style="
        background: #f5f5f0;
        border: 2px solid #3d3d34;
        border-radius: 50%;
        width: 46px; height: 46px;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 700; color: #3d3d34;
        box-shadow: 0 3px 10px rgba(0,0,0,0.2);
        font-family: system-ui, -apple-system, sans-serif;
        white-space: nowrap;
        cursor: pointer;
      ">${label}</div>`,
      className: "",
      iconSize: [46, 46],
      iconAnchor: [23, 23],
    });
  };

  if (geocodedSaves.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[55vw] min-h-[260px] max-h-[420px] border border-dashed border-border text-muted-foreground text-sm gap-2">
        <span className="text-2xl opacity-30">🗺️</span>
        <p>No saves with location data yet.</p>
        <p className="text-xs opacity-70">Saved places will appear here once they're geocoded.</p>
      </div>
    );
  }

  const centerLat = geocodedSaves.reduce((s, sv) => s + sv.lat!, 0) / geocodedSaves.length;
  const centerLng = geocodedSaves.reduce((s, sv) => s + sv.lng!, 0) / geocodedSaves.length;

  return (
    <div className="relative border border-border overflow-hidden">
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={3}
        style={{ height: "min(420px, 55vw + 60px)", minHeight: "260px", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <MarkerClusterGroup
          iconCreateFunction={createClusterIcon}
          chunkedLoading
          showCoverageOnHover={false}
          spiderfyOnMaxZoom
          disableClusteringAtZoom={10}
        >
          {geocodedSaves.map((save, idx) => (
            <MarkerPin
              key={save.id}
              save={save}
              index={idx + 1}
              selected={selectedIds.includes(save.id)}
              onToggle={onToggle}
              markerSaveMap={markerSaveMap.current}
            />
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}

interface MarkerPinProps {
  save: Save;
  index: number;
  selected: boolean;
  onToggle: (id: number) => void;
  markerSaveMap: Map<L.Marker, Save>;
}

function MarkerPin({ save, index, selected, onToggle, markerSaveMap }: MarkerPinProps) {
  const markerRef = useRef<L.Marker>(null);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    markerSaveMap.set(marker, save);
    return () => {
      markerSaveMap.delete(marker);
    };
  }, []);

  return (
    <Marker
      ref={markerRef}
      position={[save.lat!, save.lng!]}
      icon={numberedMarkerIcon(index, selected)}
      eventHandlers={{ click: () => onToggle(save.id) }}
    />
  );
}
