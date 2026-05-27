/* ========================================
   MID Meeting App - 애플리케이션 로직
   ======================================== */

// 1. 전역 변수 및 초기화
const AppState = {
  map: null,
  ps: null,
  markers: [],
  currentLocation: null,
  deferredPrompt: null,
  isSearching: false
};

// 2. 초기화
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

async function initializeApp() {
  try {
    // 지도 초기화
    initializeMap();

    // 이벤트 리스너 등록
    setupEventListeners();

    // 설치 프롬프트 처리
    setupInstallPrompt();

    // 서비스 워커 등록
    registerServiceWorker();

    showNotification('앱이 준비되었습니다!', 'success');
  } catch (error) {
    console.error('초기화 오류:', error);
    showNotification('앱 초기화에 실패했습니다', 'error');
  }
}

// 3. 지도 초기화
function initializeMap() {
  const mapContainer = document.getElementById('map');

  // 지도 옵션
  const mapOption = {
    center: new kakao.maps.LatLng(37.5665, 126.9780), // 서울 시청
    level: 3
  };

  // 지도 생성
  AppState.map = new kakao.maps.Map(mapContainer, mapOption);

  // 장소 검색 객체 생성
  AppState.ps = new kakao.maps.services.Places();

  // 검색 완료 이벤트
  AppState.ps.setMap(AppState.map);
}

// 4. 이벤트 리스너 설정
function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const locationBtn = document.getElementById('locationBtn');

  // 검색 버튼 클릭
  searchBtn.addEventListener('click', () => {
    const keyword = searchInput.value.trim();
    if (keyword) {
      searchPlaces(keyword);
    } else {
      showNotification('검색어를 입력해주세요', 'warning');
    }
  });

  // Enter 키 검색
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchBtn.click();
    }
  });

  // 현재 위치 버튼
  locationBtn.addEventListener('click', getCurrentLocationAndSearch);
}

// 5. 장소 검색
function searchPlaces(keyword) {
  if (AppState.isSearching) return;

  AppState.isSearching = true;
  showLoadingSpinner(true);

  // 기존 마커 제거
  clearMarkers();

  // 지도 중심 좌표
  const center = AppState.map.getCenter();

  // 키워드 검색
  AppState.ps.keywordSearch(keyword, (data, status) => {
    AppState.isSearching = false;
    showLoadingSpinner(false);

    if (status === kakao.maps.services.Status.OK) {
      if (data.length === 0) {
        showNotification('검색 결과가 없습니다', 'warning');
        displayPlaces([]);
        return;
      }

      // 검색 결과 처리
      displayPlaces(data);
      displayMarkers(data);

      // 지도 범위 조정
      adjustMapBounds(data);

      showNotification(`${data.length}개의 결과를 찾았습니다`, 'success');
    } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
      showNotification('검색 결과가 없습니다', 'warning');
      displayPlaces([]);
    } else if (status === kakao.maps.services.Status.ERROR) {
      showNotification('검색 중 오류가 발생했습니다', 'error');
      console.error('Search error:', status);
    }
  }, {
    location: center,
    radius: 2000,
    sort: kakao.maps.services.SortBy.DISTANCE
  });
}

// 6. 장소 목록 표시
function displayPlaces(places) {
  const listEl = document.getElementById('placesList');
  const countEl = document.getElementById('resultCount');

  if (places.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>검색 결과가 없습니다</p>
        <p class="hint">다른 검색어로 다시 시도해보세요</p>
      </div>
    `;
    countEl.textContent = '0개';
    return;
  }

  countEl.textContent = `${places.length}개`;
  listEl.innerHTML = '';

  places.forEach((place, index) => {
    const card = createPlaceCard(place, index);
    listEl.appendChild(card);
  });
}

// 7. 장소 카드 생성
function createPlaceCard(place, index) {
  const card = document.createElement('div');
  card.className = 'place-card';

  const address = place.road_address_name || place.address_name || '주소 정보 없음';
  const phone = place.phone || '전화번호 없음';

  card.innerHTML = `
    <strong>${index + 1}. ${place.place_name}</strong>
    <p>📍 ${address}</p>
    <p>📞 ${phone}</p>
    <p style="font-size: 0.75rem; color: #999;">거리: ${calculateDistance(place.y, place.x) || '정보 없음'}</p>
    <a href="${place.place_url}" target="_blank" rel="noopener noreferrer">🔗 상세보기</a>
  `;

  return card;
}

// 8. 마커 표시
function displayMarkers(places) {
  clearMarkers();

  places.forEach((place, index) => {
    const marker = new kakao.maps.Marker({
      map: AppState.map,
      position: new kakao.maps.LatLng(place.y, place.x),
      title: place.place_name
    });

    // 마커 번호 표시
    const markerContent = document.createElement('div');
    markerContent.style.cssText = `
      background-color: #007bff;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
    `;
    markerContent.textContent = index + 1;

    // 마커 클릭 이벤트
    kakao.maps.event.addListener(marker, 'click', () => {
      openInfoWindow(place, marker);
    });

    AppState.markers.push(marker);
  });
}

// 9. 정보 윈도우 열기
function openInfoWindow(place, marker) {
  // 기존 정보 윈도우 제거
  document.querySelectorAll('.kakao-infowindow').forEach(el => el.remove());

  const infowindow = new kakao.maps.InfoWindow({
    content: `
      <div style="padding: 12px; width: 250px; font-family: Arial, sans-serif;">
        <strong style="display: block; margin-bottom: 8px; font-size: 14px;">${place.place_name}</strong>
        <p style="margin: 4px 0; font-size: 12px; color: #666;">📍 ${place.road_address_name || place.address_name}</p>
        <p style="margin: 4px 0; font-size: 12px; color: #666;">📞 ${place.phone || '전화번호 없음'}</p>
        <a href="${place.place_url}" target="_blank" rel="noopener noreferrer" 
           style="display: inline-block; margin-top: 8px; color: #007bff; text-decoration: none; font-size: 12px;">
          상세보기 →
        </a>
      </div>
    `
  });

  infowindow.open(AppState.map, marker);
}

// 10. 마커 제거
function clearMarkers() {
  AppState.markers.forEach(marker => marker.setMap(null));
  AppState.markers = [];
}

// 11. 지도 범위 조정
function adjustMapBounds(places) {
  const bounds = new kakao.maps.LatLngBounds();

  places.forEach(place => {
    bounds.extend(new kakao.maps.LatLng(place.y, place.x));
  });

  AppState.map.setBounds(bounds);
}

// 12. 현재 위치 가져오기 및 검색
function getCurrentLocationAndSearch() {
  showLoadingSpinner(true);

  if (!navigator.geolocation) {
    showNotification('위치 기능이 지원되지 않습니다', 'error');
    showLoadingSpinner(false);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      AppState.currentLocation = new kakao.maps.LatLng(lat, lng);

      // 지도 중심을 현재 위치로 이동
      AppState.map.setCenter(AppState.currentLocation);

      // 현재 위치 마커 표시
      const currentMarker = new kakao.maps.Marker({
        map: AppState.map,
        position: AppState.currentLocation,
        title: '현재 위치'
      });

      showLoadingSpinner(false);
      showNotification('현재 위치 주변 카페를 검색합니다', 'success');

      // 카페 검색
      searchPlacesFromLocation('카페', lat, lng);
    },
    (error) => {
      showLoadingSpinner(false);
      console.error('위치 오류:', error);
      showNotification('위치를 가져올 수 없습니다', 'error');
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

// 13. 위치 기반 검색
function searchPlacesFromLocation(keyword, lat, lng) {
  if (AppState.isSearching) return;

  AppState.isSearching = true;
  showLoadingSpinner(true);

  clearMarkers();

  AppState.ps.keywordSearch(keyword, (data, status) => {
    AppState.isSearching = false;
    showLoadingSpinner(false);

    if (status === kakao.maps.services.Status.OK) {
      displayPlaces(data);
      displayMarkers(data);
      adjustMapBounds(data);
    } else {
      showNotification('검색에 실패했습니다', 'error');
    }
  }, {
    location: AppState.currentLocation,
    radius: 2000,
    sort: kakao.maps.services.SortBy.DISTANCE
  });
}

// 14. 거리 계산 (간단한 추정)
function calculateDistance(lat, lng) {
  if (!AppState.currentLocation) return null;

  const R = 6371; // 지구 반지름 (km)
  const dLat = (lat - AppState.currentLocation.getLat()) * Math.PI / 180;
  const dLng = (lng - AppState.currentLocation.getLng()) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(AppState.currentLocation.getLat() * Math.PI / 180) *
    Math.cos(lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = (R * c * 1000).toFixed(0); // 미터 단위

  if (distance < 1000) {
    return `${distance}m`;
  } else {
    return `${(distance / 1000).toFixed(1)}km`;
  }
}

// 15. 로딩 스피너 표시
function showLoadingSpinner(show) {
  const spinner = document.getElementById('loadingSpinner');
  spinner.style.display = show ? 'flex' : 'none';
}

// 16. 알림 표시
function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');

  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.style.display = 'block';

  // 3초 후 자동 숨김
  setTimeout(() => {
    notification.style.display = 'none';
  }, 3000);
}

// 17. 설치 프롬프트 처리
function setupInstallPrompt() {
  const installBtn = document.getElementById('installBtn');

  // beforeinstallprompt 이벤트 처리
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    AppState.deferredPrompt = e;
    installBtn.style.display = 'block';
  });

  // 설치 버튼 클릭
  installBtn.addEventListener('click', async () => {
    if (AppState.deferredPrompt) {
      AppState.deferredPrompt.prompt();
      const { outcome } = await AppState.deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        showNotification('앱이 설치되었습니다!', 'success');
      }

      AppState.deferredPrompt = null;
      installBtn.style.display = 'none';
    }
  });

  // 설치 완료 이벤트
  window.addEventListener('appinstalled', () => {
    showNotification('앱이 홈 화면에 추가되었습니다!', 'success');
    AppState.deferredPrompt = null;
  });
}

// 18. 서비스 워커 등록
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker가 지원되지 않습니다');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js');
    console.log('Service Worker 등록 성공:', registration);

    // 업데이트 확인
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showNotification('새로운 버전이 준비되었습니다', 'success');
        }
      });
    });
  } catch (error) {
    console.error('Service Worker 등록 실패:', error);
  }
}

// 19. PWA 상태 확인
window.addEventListener('online', () => {
  showNotification('인터넷 연결되었습니다', 'success');
});

window.addEventListener('offline', () => {
  showNotification('인터넷 연결이 끊어졌습니다', 'warning');
});
