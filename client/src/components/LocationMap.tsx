import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Map, MapGeoJSON, MapMarker, MarkerContent, useMap } from './ui/map';
import { useLanguage } from '../context/LanguageContext';
import { geofencePolygon, haversineMeters } from '../utils/geo';

interface OfficeGeofence {
  name?: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

interface LocationMapProps {
  lat: number;
  lng: number;
  accuracy?: number;
  office?: OfficeGeofence | null;
  className?: string;
}

function viewFor(lat: number, lng: number, office?: OfficeGeofence | null) {
  if (!office) return { center: [lng, lat] as [number, number], zoom: 16 };

  const distance = haversineMeters(lat, lng, office.latitude, office.longitude);
  const span = Math.max(distance + (office.radius_meters || 0) * 2, 150);
  let zoom = 16;
  if (span > 150) zoom = 15;
  if (span > 350) zoom = 14;
  if (span > 700) zoom = 13;
  if (span > 1500) zoom = 12;
  if (span > 3000) zoom = 11;

  return {
    center: [(lng + office.longitude) / 2, (lat + office.latitude) / 2] as [number, number],
    zoom,
  };
}

/**
 * Leaves room at the bottom of the map (where the floating clock button sits)
 * so the geographic center lands around 30% from the top of the screen.
 */
const MapBottomPadding: React.FC<{ ratio: number }> = ({ ratio }) => {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;

    const apply = () => {
      const height = map.getContainer().clientHeight || window.innerHeight;
      map.setPadding({ top: 0, bottom: Math.round(height * ratio), left: 0, right: 0 });
    };

    apply();
    map.on('resize', apply);
    return () => {
      map.off('resize', apply);
    };
  }, [map, isLoaded, ratio]);

  return null;
};

/** Recenters in place instead of remounting the map (avoids the white flash). */
const MapRecenter: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;
    map.jumpTo({ center, zoom });
  }, [map, isLoaded, center[0], center[1], zoom]);

  return null;
};

const MapLoadingOverlay: React.FC = () => {
  const { isLoaded } = useMap();
  const { tr } = useLanguage();

  if (isLoaded) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-100">
      <Loader2 size={22} className="animate-spin text-blue-600" />
      <span className="text-[11px] font-medium text-slate-500">
        {tr('Memuat peta...', 'Loading map...')}
      </span>
    </div>
  );
};

export const LocationMap: React.FC<LocationMapProps> = ({ lat, lng, office, className }) => {
  const { center, zoom } = viewFor(lat, lng, office);
  const officeFence =
    office && office.latitude && office.longitude
      ? geofencePolygon(office.longitude, office.latitude, office.radius_meters || 100)
      : null;

  return (
    <div className={className}>
      <Map
        center={center}
        zoom={zoom}
        fadeDuration={0}
        scrollZoom={false}
        doubleClickZoom={false}
        touchZoomRotate={false}
        boxZoom={false}
        keyboard={false}
        dragRotate={false}
        touchPitch={false}
        className="h-full w-full"
      >
        <MapBottomPadding ratio={0.4} />
        <MapRecenter center={center} zoom={zoom} />
        <MapLoadingOverlay />

        {officeFence && (
          <MapGeoJSON
            data={officeFence}
            id="office-geofence"
            fillPaint={{ 'fill-color': '#2563eb', 'fill-opacity': 0.14 }}
            linePaint={{ 'line-color': '#2563eb', 'line-width': 1.5, 'line-opacity': 0.9 }}
          />
        )}

        {office && (
          <MapMarker longitude={office.longitude} latitude={office.latitude}>
            <MarkerContent>
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border-2 border-white bg-blue-700 shadow" />
            </MarkerContent>
          </MapMarker>
        )}

        <MapMarker longitude={lng} latitude={lat}>
          <MarkerContent>
            <span className="relative flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
              <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow" />
            </span>
          </MarkerContent>
        </MapMarker>
      </Map>
    </div>
  );
};
