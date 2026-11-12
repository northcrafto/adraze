// Varumärken och namn som aldrig översätts. Står de ensamma tas de inte med i _sv-base.json (i18n-extrahera.js);
// står de i en längre text byter gen_i18n.js ut dem mot platshållare före översättningen och kontrollerar efteråt att
// de finns kvar. Längre namn först i MONSTER så att "AdRaze Pro" skyddas som en helhet.
const MARKEN = new Set([
  'AdRaze', 'AdRaze Pro', 'AdRaze Wallet', 'Falk', 'Pro', 'Säkerkoll', 'Vaka', 'Gamelot', 'Skribia', 'Prowl',
  'YouTube', 'Google', 'Chrome', 'Chromium', 'Firefox', 'Safari', 'Edge', 'Brave', 'Opera', 'Vivaldi', 'Electron',
  'DuckDuckGo', 'Bing', 'Ecosia', 'Startpage', 'Qwant', 'Yahoo', 'Brave Search', 'Kagi',
  'Stripe', 'Klarna', 'Swish', 'Mastercard', 'PayPal', 'Apple Pay', 'Google Pay',
  'Windows', 'Linux', 'macOS', 'Android', 'iOS', 'Apple', 'Microsoft',
  'GitHub', 'Discord', 'Twitter', 'Facebook', 'Instagram', 'TikTok', 'Reddit', 'Wikipedia', 'Spotify', 'Netflix', 'Twitch',
  'Gmail', 'Outlook', 'WhatsApp', 'Telegram', 'Messenger', 'ChatGPT', 'Claude', 'OpenAI', 'Gemini',
  'EasyList', 'EasyPrivacy', 'uBlock', 'uBlock Origin', 'AdGuard',
]);
// Mönster som skyddas i längre text (ordgränser). Vanliga ord som också är namn (Edge, Signal, Opera) skyddas inte här:
// de översätts bara fel i undantagsfall och kontrolleras inte.
const MONSTER = ['AdRaze Pro', 'AdRaze Wallet', 'AdRaze', 'Säkerkoll', 'Falk', 'YouTube', 'DuckDuckGo', 'Google', 'Chrome', 'Chromium', 'Firefox',
  'Stripe', 'Klarna', 'Swish', 'GitHub', 'Discord', 'Wikipedia', 'TikTok', 'Instagram', 'Facebook', 'WhatsApp', 'Gmail', 'ChatGPT',
  'EasyList', 'EasyPrivacy', 'uBlock Origin', 'uBlock', 'Ecosia', 'Startpage', 'Bing', 'Gamelot', 'Skribia', 'Prowl', 'Electron', 'Pexels', 'Pro'];
module.exports = MARKEN;
module.exports.MONSTER = MONSTER;
// Strängar som alltid ska finnas i basen fast extraktorn inte tar med dem
module.exports.HALL = [
  // platshållare med adresser (extraktorn tar inte med text med ://)
  'https://chromewebstore.google.com/detail/… eller id', 'https://sajt.se',
];
