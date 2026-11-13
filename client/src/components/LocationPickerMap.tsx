import React, { useEffect, useRef } from 'react';
import { Map, MapGeoJSON, MapMarker, MarkerContent, useMap } from './ui/map';
import { geofencePolygon } from '../utils/geo';

const OSM_STYLE = 'https://tiles.openfreemap.org/styles/bright';

interface LocationPickerMapProps {
  lat: number;
  lng: number;
  radius?: number;
  onChange: (lat: number, lng: number) => void;
  className?: string;
}

const ClickToPick: React.FC<{ onPick: (lat: number, lng: number) => void }> = ({ onPick }) => {
  const { map } = useMap();
  const callbackRef = useRef(onPick);
  callbackRef.current = onPick;

  useEffect(() => {
    if (!map) return;

    const handleClick = (event: any) => {
      callbackRef.current(event.lngLat.lat, event.lngLat.lng);
    };

    map.on('click', handleClick);
    map.getCanvas().style.cursor = 'crosshair';

    return () => {
      map.off('click', handleClick);
      map.getCanvas().style.cursor = '';
    };
  }, [map]);

  return null;
};

const Recenter: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;
    map.flyTo({ center: [lng, lat], duration: 400 });
  }, [map, isLoaded, lat, lng]);

  return null;
};

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({
  lat,
  lng,
  radius,
  onChange,
  className,
}) => {
  const safeLat = Number.isFinite(lat) ? lat : -6.2088;
  const safeLng = Number.isFinite(lng) ? lng : 106.8456;
  const fence =
    radius && radius > 0 ? geofencePolygon(safeLng, safeLat, radius) : null;

  return (
    <div className={className || 'h-56 w-full overflow-hidden rounded-xl border border-slate-200'}>
      <Map
        center={[safeLng, safeLat]}
        zoom={16}
        theme="light"
        styles={{ light: OSM_STYLE, dark: OSM_STYLE }}
        className="h-full w-full"
      >
        <ClickToPick onPick={onChange} />
        <Recenter lat={safeLat} lng={safeLng} />

        {fence && (
          <MapGeoJSON
            data={fence}
            id="picker-fence"
            fillPaint={{ 'fill-color': '#2563eb', 'fill-opacity': 0.14 }}
            linePaint={{ 'line-color': '#2563eb', 'line-width': 1.5, 'line-opacity': 0.9 }}
          />
        )}

        <MapMarker
          longitude={safeLng}
          latitude={safeLat}
          draggable
          onDragEnd={(position) => onChange(position.lat, position.lng)}
        >
          <MarkerContent>
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-600 shadow-lg">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
          </MarkerContent>
        </MapMarker>
      </Map>
    </div>
  );
};
