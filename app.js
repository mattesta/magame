const map = L.map('map', { zoomControl: true, worldCopyJump: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);

let userMarker = null;
let headingLine = null;
let watchId = null;
let lastPos = null;
let currentHeading = null;
let lineVisible = false;
let lineLocked = false;

let posReady = false;
let headingReady = false;

const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const showBtn = document.getElementById('showBtn');
const resetBtn = document.getElementById('resetBtn');

function setStatus(s){ statusEl.textContent = s; }

// calcola la destinazione a distanza "distanceMeters" e bearing "bearingDeg"
function destLatLng(lat, lon, bearingDeg, distanceMeters){
  const R = 6378137;
  const brng = bearingDeg * Math.PI/180;
  const d = distanceMeters;
  const lat1 = lat * Math.PI/180;
  const lon1 = lon * Math.PI/180;
  const lat2 = Math.asin(Math.sin(lat1)*Math.cos(d/R)+Math.cos(lat1)*Math.sin(d/R)*Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng)*Math.sin(d/R)*Math.cos(lat1), Math.cos(d/R)-Math.sin(lat1)*Math.sin(lat2));
  return [lat2*180/Math.PI, lon2*180/Math.PI];
}

// aggiorna la linea in base a posizione e heading
function updateLine(position, heading){
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const distance = 20000000; // 20,000 km
  const dest = destLatLng(lat, lon, heading, distance);

  // marker utente
  if (!userMarker) userMarker = L.marker([lat, lon]).addTo(map);
  else userMarker.setLatLng([lat, lon]);

  // linea
  if (!headingLine) headingLine = L.polyline([[lat, lon], dest], { color: 'red', weight: 4 }).addTo(map);
  else headingLine.setLatLngs([[lat, lon], dest]);

  // centra mappa solo la prima volta
  if (!lineVisible && !lineLocked) map.setView([lat, lon], 16);
}

// richiede permessi bussola iOS
async function requestDeviceOrientationPermission(){
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const resp = await DeviceOrientationEvent.requestPermission();
      return resp === 'granted';
    } catch {
      return false;
    }
  }
  return true; // non-iOS o già consentito
}

// gestione bussola
function handleOrientationEvent(e){
  let heading = null;

  // iOS
  if (typeof e.webkitCompassHeading === "number") {
    heading = e.webkitCompassHeading;
  } 
  // Android / altri
  else if (typeof e.alpha === "number") {
    heading = e.alpha;
  } 
  else return;

  const screenAngle = (screen.orientation && screen.orientation.angle) || 0;
  heading = (heading - screenAngle + 360) % 360;

  currentHeading = heading;
  headingReady = true;

  if (posReady && !lineLocked) updateLine(lastPos, currentHeading);
}

function start() {
  startBtn.disabled = true;
  setStatus('Requesting permissions...');

  requestDeviceOrientationPermission().then(ok=>{
    if (!ok) setStatus('Device orientation permission denied (compass may not work).');
    else setStatus('Waiting for position & orientation...');

    window.addEventListener('deviceorientation', handleOrientationEvent, true);

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(pos=>{
        lastPos = pos;
        posReady = true;
        setStatus('Position acquired. Move phone to set direction.');

        if (!userMarker) {
          const lat = pos.coords.latitude, lon = pos.coords.longitude;
          userMarker = L.marker([lat, lon]).addTo(map);
          map.setView([lat, lon], 16);
        }

        if (headingReady && !lineLocked) updateLine(lastPos, currentHeading);

      }, err=>{
        setStatus('Geolocation error: ' + err.message);
      }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
    } else {
      setStatus('Geolocation not supported.');
    }

    showBtn.disabled = false;
    resetBtn.disabled = false;
  });
}

// Mostra linea e la blocca
showBtn.addEventListener('click', ()=>{
  if (!lastPos || currentHeading == null) {
    setStatus("Aspetto posizione & bussola…");
    return;
  }
  lineVisible = true;
  lineLocked = true;
  updateLine(lastPos, currentHeading);
  setStatus("Linea fissata sulla mappa.");
});

// Reset linea
resetBtn.addEventListener('click', ()=>{
  lineVisible = false;
  lineLocked = false;
  if (headingLine) {
    map.removeLayer(headingLine);
    headingLine = null;
  }
  setStatus("Linea nascosta. Puoi premere 'Mostra linea' di nuovo.");
});

// start
startBtn.addEventListener('click', start);

// cleanup
window.addEventListener('beforeunload', ()=> {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  window.removeEventListener('deviceorientation', handleOrientationEvent);
});
