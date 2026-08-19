/* 방문 알림 비콘 — GAS→텔레그램 릴레이 (다른 사이트들과 같은 GAS를 공유하고
 * ref 접두사로 구분한다). 여기서 나가는 유일한 외부 요청이므로, 앱 화면
 * (app.html)에는 붙이지 않는다 — "앱을 여는 순간부터 외부 요청 0건"이 제품의
 * 주장이고, 랜딩 페이지 방문 집계 때문에 그 주장을 흐릴 이유가 없다.
 *
 * ?owner=1 로 한 번 들어오면 이후 이 브라우저는 제외된다(github.io 오리진 공유라
 * 내 다른 사이트에도 같이 적용). localhost·127·file:// 은 개발 소음이라 스킵. */
(function () {
  var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxWKySPAxWsYnoZ9zo7G2wUK2CusxPwjy1USt_DyCFmmIe_y2pu8lAKBluImAHXXKHv4A/exec';
  var SITE = 'livingpaper';
  try {
    if (location.search.indexOf('owner=1') !== -1) {
      localStorage.setItem('__is_owner__', '1');
    } else if (localStorage.getItem('__is_owner__') !== '1'
      && location.protocol !== 'file:'
      && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      var img = new Image();
      img.src = WEBAPP_URL + '?ref=' + encodeURIComponent(SITE + '|' + (document.referrer || 'direct'));
    }
  } catch (e) {}
})();
