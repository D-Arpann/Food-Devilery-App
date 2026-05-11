import { useEffect, useRef, useState } from 'react';
import { getGoogleMapsApiKey, loadGoogleMaps, normalizeCoordinate, toLatLngLiteral } from '../lib/googleMaps';

export default function RouteMap({
  restaurant,
  deliveryLocation,
  riderLocation,
  title = 'Delivery route',
}) {
  const mapRef = useRef(null);
  const [status, setStatus] = useState('');
  const hasKey = Boolean(getGoogleMapsApiKey());
  const restaurantCoordinate = normalizeCoordinate({
    latitude: restaurant?.latitude,
    longitude: restaurant?.longitude,
  });
  const deliveryCoordinate = normalizeCoordinate(deliveryLocation);
  const riderCoordinate = normalizeCoordinate(riderLocation);

  useEffect(() => {
    let cancelled = false;

    async function drawMap() {
      if (!hasKey || !mapRef.current) {
        return;
      }

      const points = [restaurantCoordinate, deliveryCoordinate, riderCoordinate].filter(Boolean);
      if (!points.length) {
        return;
      }

      try {
        const google = await loadGoogleMaps();
        if (cancelled) {
          return;
        }

        const map = new google.maps.Map(mapRef.current, {
          center: toLatLngLiteral(points[0]),
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        const bounds = new google.maps.LatLngBounds();

        const addMarker = (coordinate, label, color) => {
          if (!coordinate) {
            return;
          }

          const position = toLatLngLiteral(coordinate);
          bounds.extend(position);
          new google.maps.Marker({
            map,
            position,
            title: label,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
          });
        };

        addMarker(restaurantCoordinate, restaurant?.name || 'Restaurant', '#2E6B4F');
        addMarker(deliveryCoordinate, 'Delivery address', '#1E1E1E');
        addMarker(riderCoordinate, 'Rider', '#F8964F');

        const linePoints = [riderCoordinate || restaurantCoordinate, deliveryCoordinate].filter(Boolean);
        if (linePoints.length === 2) {
          new google.maps.Polyline({
            map,
            path: linePoints.map(toLatLngLiteral),
            strokeColor: '#F8964F',
            strokeOpacity: 0.95,
            strokeWeight: 4,
          });
        }

        if (points.length > 1) {
          map.fitBounds(bounds, 34);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error.message || 'Route map could not be loaded.');
        }
      }
    }

    drawMap();

    return () => {
      cancelled = true;
    };
  }, [deliveryCoordinate, hasKey, restaurant, restaurantCoordinate, riderCoordinate]);

  return (
    <div className="route-map-card">
      <div className="route-map-head">
        <strong>{title}</strong>
        <span>{riderCoordinate ? 'Live rider' : 'Pinned route'}</span>
      </div>
      <div className="route-map-canvas" ref={mapRef}>
        {!hasKey ? <span>Add a Google Maps API key to show the route map.</span> : null}
        {hasKey && !restaurantCoordinate && !deliveryCoordinate ? <span>Select a precise address pin.</span> : null}
      </div>
      {status ? <p className="route-map-status">{status}</p> : null}
    </div>
  );
}
