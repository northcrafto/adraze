// AdRaze adblock-motor — vår egen, i C++ (ingen kopia av Braves adblock-rust).
// Matchar nätverksregler i Adblock Plus/EasyList-syntax mot varje request. Den tunga biten
// (filterparsning + matchning) körs i maskinkod; JS-lagret ovanför (adblock-adraze.js) matar in
// listorna och sköter Electron-delarna (webRequest, redirect, removeparam, kosmetik).
//
// Fart: varje filter läggs i en hink efter ett nyckelord (token). Vid matchning plockas tokens ur
// URL:en och bara filtren i de hinkarna (plus de tokenlösa) provas — i stället för alla ~30 000.

#include <napi.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <cstdint>

namespace {

// Resurstyper (bitmask). Matchar strängarna Electrons webRequest ger oss.
enum Typ : uint32_t {
  T_OTHER=1, T_SCRIPT=2, T_IMAGE=4, T_STYLE=8, T_OBJECT=16, T_XHR=32,
  T_SUBDOC=64, T_FONT=128, T_MEDIA=256, T_WS=512, T_PING=1024, T_DOC=2048,
};

uint32_t typAvStrang(const std::string& s) {
  if (s == "script") return T_SCRIPT;
  if (s == "image" || s == "imageset") return T_IMAGE;
  if (s == "stylesheet") return T_STYLE;
  if (s == "object") return T_OBJECT;
  if (s == "xhr" || s == "xmlhttprequest" || s == "fetch") return T_XHR;
  if (s == "subFrame" || s == "sub_frame" || s == "subdocument") return T_SUBDOC;
  if (s == "font") return T_FONT;
  if (s == "media") return T_MEDIA;
  if (s == "webSocket" || s == "websocket") return T_WS;
  if (s == "ping" || s == "cspReport" || s == "beacon") return T_PING;
  if (s == "mainFrame" || s == "main_frame" || s == "document") return T_DOC;
  return T_OTHER;
}
// Option-namn (i ett filter) → bitmask
uint32_t typAvOption(const std::string& s) {
  if (s == "script") return T_SCRIPT;
  if (s == "image") return T_IMAGE;
  if (s == "stylesheet" || s == "css") return T_STYLE;
  if (s == "object" || s == "object-subrequest") return T_OBJECT;
  if (s == "xmlhttprequest" || s == "xhr") return T_XHR;
  if (s == "subdocument" || s == "frame") return T_SUBDOC;
  if (s == "font") return T_FONT;
  if (s == "media") return T_MEDIA;
  if (s == "websocket") return T_WS;
  if (s == "ping" || s == "beacon") return T_PING;
  if (s == "document" || s == "doc") return T_DOC;
  if (s == "other") return T_OTHER;
  return 0;
}

inline char lower(char c) { return (c >= 'A' && c <= 'Z') ? c + 32 : c; }
inline bool word(char c) { // tecken som INTE är en separator för ^
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '.' || c == '%' || c == '-';
}

struct Filter {
  std::string pat;              // mönster, gemener, utan ankare/optioner
  bool anchorHost=false;        // ||
  bool anchorStart=false;       // |... i början
  bool anchorEnd=false;         // ...| i slutet
  bool hasWild=false;           // innehåller *
  bool hasSep=false;            // innehåller ^
  uint32_t typPos=0;            // positiva typer (0 = alla)
  uint32_t typNeg=0;            // negerade typer
  int tredje=0;                 // 0 valfri, 1 kräver third-party, -1 kräver first-party
  std::vector<std::string> domIn;   // domain= (måste vara en av dessa)
  std::vector<std::string> domEx;   // ~domain (får inte vara någon av dessa)
  std::string redirect;             // $redirect=/$redirect-rule= : ersätt resursen med en ofarlig stub
};

// Resultat av en matchning
struct Beslut {
  bool block = false;
  const std::string* redirect = nullptr;   // pekar på filtrets redirect-namn (tom = ren blockering)
};

// Matcha mönstret p (från pi) mot s (från si). Stödjer * och ^. mustEnd = måste sluta vid s-slut.
bool matchFrom(const std::string& p, size_t pi, const std::string& s, size_t si, bool mustEnd) {
  while (pi < p.size()) {
    char c = p[pi];
    if (c == '*') {
      do { pi++; } while (pi < p.size() && p[pi] == '*');
      if (pi == p.size()) return mustEnd ? true : true;  // * i slutet matchar resten
      for (size_t k = si; k <= s.size(); k++)
        if (matchFrom(p, pi, s, k, mustEnd)) return true;
      return false;
    } else if (c == '^') {
      if (si == s.size()) { pi++; continue; }            // ^ matchar även slutet
      if (word(s[si])) return false;
      pi++; si++;
    } else {
      if (si >= s.size() || s[si] != c) return false;
      pi++; si++;
    }
  }
  return mustEnd ? (si == s.size()) : true;
}

struct Motor {
  std::vector<Filter> block, tillat;
  std::unordered_map<std::string, std::vector<uint32_t>> blockTok, tillatTok;  // token → index
  std::vector<uint32_t> blockGen, tillatGen;                                   // tokenlösa

  // Plocka ett nyckelord (längsta a-z0-9-sträng ≥ 3) ur mönstret som hink-nyckel
  static std::string token(const std::string& p) {
    std::string best, cur;
    for (char c : p) {
      if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) cur += c;
      else { if (cur.size() > best.size()) best = cur; cur.clear(); }
    }
    if (cur.size() > best.size()) best = cur;
    return best.size() >= 3 ? best : std::string();
  }

  void lagg(const std::string& rad) {
    if (rad.empty() || rad[0] == '!' || rad[0] == '[') return;            // kommentar
    // kosmetik och scriptlets hanteras av content-skripten, inte här
    if (rad.find("##") != std::string::npos || rad.find("#@#") != std::string::npos ||
        rad.find("#?#") != std::string::npos || rad.find("#$#") != std::string::npos) return;

    std::string s = rad;
    Filter f;
    bool exception = (s.size() >= 2 && s[0] == '@' && s[1] == '@');
    if (exception) s = s.substr(2);

    // optioner efter sista '$' (men inte '$' inuti en regex /.../)
    std::string opts;
    if (!s.empty() && s[0] != '/') {
      size_t d = s.rfind('$');
      if (d != std::string::npos) { opts = s.substr(d + 1); s = s.substr(0, d); }
    }
    if (s.size() >= 2 && s[0] == '/' && s.back() == '/') return;   // äkta regex-filter /.../: hoppa i v1

    // optioner
    bool stod = true;
    if (!opts.empty()) {
      size_t i = 0;
      while (i <= opts.size()) {
        size_t j = opts.find(',', i);
        std::string o = opts.substr(i, j == std::string::npos ? std::string::npos : j - i);
        if (!o.empty()) {
          bool neg = o[0] == '~';
          std::string name = neg ? o.substr(1) : o;
          if (name == "third-party" || name == "3p") f.tredje = neg ? -1 : 1;
          else if (name == "first-party" || name == "1p") f.tredje = neg ? 1 : -1;
          else if (name.rfind("domain=", 0) == 0) {
            std::string ds = name.substr(7); size_t a = 0;
            while (a <= ds.size()) {
              size_t b = ds.find('|', a);
              std::string one = ds.substr(a, b == std::string::npos ? std::string::npos : b - a);
              if (!one.empty()) { if (one[0]=='~') f.domEx.push_back(one.substr(1)); else f.domIn.push_back(one); }
              if (b == std::string::npos) break; a = b + 1;
            }
          }
          else if (name.rfind("redirect=", 0) == 0) f.redirect = name.substr(9);
          else if (name.rfind("redirect-rule=", 0) == 0) f.redirect = name.substr(14);
          else if (name.rfind("rewrite=abp-resource:", 0) == 0) f.redirect = name.substr(21);
          else if (name == "important" || name == "match-case" || name == "all" || name == "popup") { /* ignorera, påverkar ej blockbeslut i v1 */ }
          else {
            uint32_t t = typAvOption(name);
            if (t) { if (neg) f.typNeg |= t; else f.typPos |= t; }
            else stod = false;   // okänd/ohanterbar option (redirect, removeparam, csp …) → hoppa filtret
          }
        }
        if (j == std::string::npos) break; i = j + 1;
      }
    }
    if (!stod) return;
    // redirect-namnet kan ha ett prioritets-suffix (noopjs:10) — ta bort det
    if (!f.redirect.empty()) { size_t c = f.redirect.find(':'); if (c != std::string::npos) f.redirect.erase(c); }

    // ankare
    if (s.size() >= 2 && s[0] == '|' && s[1] == '|') { f.anchorHost = true; s = s.substr(2); }
    else if (!s.empty() && s[0] == '|') { f.anchorStart = true; s = s.substr(1); }
    if (!s.empty() && s.back() == '|') { f.anchorEnd = true; s.pop_back(); }

    for (char& c : s) c = lower(c);
    f.hasWild = s.find('*') != std::string::npos;
    f.hasSep  = s.find('^') != std::string::npos;
    f.pat = s;
    if (f.pat.empty() && f.domIn.empty()) return;

    // token ur mönstret (hoppa över * och ^ genom token())
    std::string tok = token(f.pat);
    auto& vec = exception ? tillat : block;
    uint32_t idx = (uint32_t)vec.size();
    vec.push_back(std::move(f));
    if (exception) { if (tok.empty()) tillatGen.push_back(idx); else tillatTok[tok].push_back(idx); }
    else           { if (tok.empty()) blockGen.push_back(idx);  else blockTok[tok].push_back(idx); }
  }

  // matchar ETT filter mot en request
  static bool traffar(const Filter& f, const std::string& url, size_t hostStart, size_t hostEnd,
                      const std::string& srcHost, uint32_t typ, bool tredjePart) {
    if (f.typPos && !(f.typPos & typ)) return false;
    if (f.typNeg & typ) return false;
    if (f.tredje == 1 && !tredjePart) return false;
    if (f.tredje == -1 && tredjePart) return false;
    if (!f.domIn.empty()) {
      bool ok = false;
      for (auto& d : f.domIn) if (hostMatchar(srcHost, d)) { ok = true; break; }
      if (!ok) return false;
    }
    for (auto& d : f.domEx) if (hostMatchar(srcHost, d)) return false;
    if (f.pat.empty()) return true;   // bara domain=-filter

    const std::string& p = f.pat;
    bool mustEnd = f.anchorEnd;
    if (f.anchorStart) return matchFrom(p, 0, url, 0, mustEnd);
    if (f.anchorHost) {
      // prova vid hostens början och efter varje punkt i hosten
      for (size_t k = hostStart; k <= hostEnd; k++) {
        if (k == hostStart || (k > hostStart && url[k - 1] == '.'))
          if (matchFrom(p, 0, url, k, mustEnd)) return true;
      }
      return false;
    }
    // vanligt delsträngs-mönster: snabbväg utan jokrar
    if (!f.hasWild && !f.hasSep) {
      if (f.anchorEnd) return url.size() >= p.size() && url.compare(url.size() - p.size(), p.size(), p) == 0;
      return url.find(p) != std::string::npos;
    }
    for (size_t k = 0; k <= url.size(); k++)
      if (matchFrom(p, 0, url, k, mustEnd)) return true;
    return false;
  }

  // suffix-matchning av domän: host == d eller host slutar på "." + d
  static bool hostMatchar(const std::string& host, const std::string& d) {
    if (d.size() > host.size()) return false;
    if (host.compare(host.size() - d.size(), d.size(), d) != 0) return false;
    return host.size() == d.size() || host[host.size() - d.size() - 1] == '.';
  }

  // Returnerar det först matchande filtret, men föredrar ett med redirect (så en stub vinner
   // över en ren blockering för samma resurs). nullptr = inget matchar.
  const Filter* kolla(const std::vector<Filter>& filter, const std::unordered_map<std::string, std::vector<uint32_t>>& tokMap,
             const std::vector<uint32_t>& gen, const std::string& url, size_t hostStart, size_t hostEnd,
             const std::string& srcHost, uint32_t typ, bool tredjePart) {
    const Filter* forsta = nullptr;
    auto prova = [&](const Filter& f) -> bool {
      if (!traffar(f, url, hostStart, hostEnd, srcHost, typ, tredjePart)) return false;
      if (!f.redirect.empty()) { forsta = &f; return true; }   // redirect vinner direkt
      if (!forsta) forsta = &f;
      return false;
    };
    for (uint32_t i : gen) if (prova(filter[i])) return forsta;
    std::string cur;
    for (size_t i = 0; i <= url.size(); i++) {
      char c = i < url.size() ? url[i] : 0;
      if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) { cur += c; continue; }
      if (cur.size() >= 3) {
        auto it = tokMap.find(cur);
        if (it != tokMap.end())
          for (uint32_t idx : it->second) if (prova(filter[idx])) return forsta;
      }
      cur.clear();
    }
    return forsta;
  }

  Beslut matcha(std::string url, const std::string& srcHost, uint32_t typ, bool tredjePart) {
    Beslut b;
    for (char& c : url) c = lower(c);
    size_t hs = url.find("://");
    hs = (hs == std::string::npos) ? 0 : hs + 3;
    size_t he = hs;
    while (he < url.size() && url[he] != '/' && url[he] != '?' && url[he] != '#') he++;
    const Filter* bf = kolla(block, blockTok, blockGen, url, hs, he, srcHost, typ, tredjePart);
    if (!bf) return b;                                                                      // inget blockar
    if (kolla(tillat, tillatTok, tillatGen, url, hs, he, srcHost, typ, tredjePart)) return b;  // undantag vinner
    b.block = true;
    if (!bf->redirect.empty()) b.redirect = &bf->redirect;
    return b;
  }

  // ── Serialisering: spara det tolkade tillståndet till en binär klump och läsa tillbaka det,
  //    så uppstarten slipper tolka om ~2 MB listtext varje gång. ──
  static const uint8_t VERSION = 1;
  static void u32(std::string& o, uint32_t v) { for (int i = 0; i < 4; i++) o += (char)((v >> (i * 8)) & 0xff); }
  static void str(std::string& o, const std::string& s) { u32(o, (uint32_t)s.size()); o += s; }
  static void skrivFilter(std::string& o, const std::vector<Filter>& v) {
    u32(o, (uint32_t)v.size());
    for (const auto& f : v) {
      str(o, f.pat);
      uint8_t flags = (f.anchorHost ? 1 : 0) | (f.anchorStart ? 2 : 0) | (f.anchorEnd ? 4 : 0) | (f.hasWild ? 8 : 0) | (f.hasSep ? 16 : 0);
      o += (char)flags;
      u32(o, f.typPos); u32(o, f.typNeg); o += (char)(int8_t)f.tredje;
      u32(o, (uint32_t)f.domIn.size()); for (const auto& d : f.domIn) str(o, d);
      u32(o, (uint32_t)f.domEx.size()); for (const auto& d : f.domEx) str(o, d);
      str(o, f.redirect);
    }
  }
  std::string serialisera() const {
    std::string o; o += "ADRZ"; o += (char)VERSION;
    skrivFilter(o, block); skrivFilter(o, tillat);
    return o;
  }

  struct Lasare { const char* p; size_t kvar; bool fel = false;
    uint32_t u32() { if (kvar < 4) { fel = true; return 0; } uint32_t v = 0; for (int i = 0; i < 4; i++) v |= (uint32_t)(uint8_t)p[i] << (i * 8); p += 4; kvar -= 4; return v; }
    uint8_t u8() { if (!kvar) { fel = true; return 0; } uint8_t v = (uint8_t)*p; p++; kvar--; return v; }
    std::string str() { uint32_t n = u32(); if (fel || n > kvar) { fel = true; return std::string(); } std::string s(p, n); p += n; kvar -= n; return s; }
  };
  bool lasFilter(Lasare& r, bool exception) {
    uint32_t n = r.u32(); if (r.fel) return false;
    auto& vec = exception ? tillat : block;
    for (uint32_t i = 0; i < n; i++) {
      Filter f;
      f.pat = r.str();
      uint8_t flags = r.u8();
      f.anchorHost = flags & 1; f.anchorStart = flags & 2; f.anchorEnd = flags & 4; f.hasWild = flags & 8; f.hasSep = flags & 16;
      f.typPos = r.u32(); f.typNeg = r.u32(); f.tredje = (int8_t)r.u8();
      uint32_t di = r.u32(); if (r.fel || di > r.kvar) return false; for (uint32_t k = 0; k < di; k++) f.domIn.push_back(r.str());
      uint32_t de = r.u32(); if (r.fel || de > r.kvar) return false; for (uint32_t k = 0; k < de; k++) f.domEx.push_back(r.str());
      f.redirect = r.str();
      if (r.fel) return false;
      std::string tok = token(f.pat);
      uint32_t idx = (uint32_t)vec.size();
      vec.push_back(std::move(f));
      if (exception) { if (tok.empty()) tillatGen.push_back(idx); else tillatTok[tok].push_back(idx); }
      else           { if (tok.empty()) blockGen.push_back(idx);  else blockTok[tok].push_back(idx); }
    }
    return true;
  }
  bool deserialisera(const char* data, size_t len) {
    if (len < 5 || data[0] != 'A' || data[1] != 'D' || data[2] != 'R' || data[3] != 'Z' || (uint8_t)data[4] != VERSION) return false;
    block.clear(); tillat.clear(); blockTok.clear(); tillatTok.clear(); blockGen.clear(); tillatGen.clear();
    Lasare r{ data + 5, len - 5 };
    if (!lasFilter(r, false) || !lasFilter(r, true) || r.fel) {
      block.clear(); tillat.clear(); blockTok.clear(); tillatTok.clear(); blockGen.clear(); tillatGen.clear();
      return false;
    }
    return true;
  }
};

}  // anonymt namespace (hjälpare + motor)

// ── Napi-omslag (filscope, krävs för modulregistreringen) ──
class Adblock : public Napi::ObjectWrap<Adblock> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function f = DefineClass(env, "Adblock", {
      InstanceMethod("laggLista", &Adblock::LaggLista),
      InstanceMethod("matcha", &Adblock::Matcha),
      InstanceMethod("antal", &Adblock::Antal),
      InstanceMethod("serialisera", &Adblock::Serialisera),
      InstanceMethod("deserialisera", &Adblock::Deserialisera),
    });
    exports.Set("Adblock", f);
    return exports;
  }
  Adblock(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Adblock>(info) {}

private:
  Motor motor;

  Napi::Value LaggLista(const Napi::CallbackInfo& info) {
    std::string text = info[0].As<Napi::String>();
    size_t i = 0;
    while (i <= text.size()) {
      size_t j = text.find('\n', i);
      size_t end = (j == std::string::npos) ? text.size() : j;
      size_t b = i; size_t e = end;
      while (b < e && (text[b] == ' ' || text[b] == '\t' || text[b] == '\r')) b++;
      while (e > b && (text[e-1] == ' ' || text[e-1] == '\t' || text[e-1] == '\r')) e--;
      if (e > b) motor.lagg(text.substr(b, e - b));
      if (j == std::string::npos) break; i = j + 1;
    }
    return Napi::Number::New(info.Env(), (double)(motor.block.size() + motor.tillat.size()));
  }
  // Returnerar { block: bool, redirect: string|'' }
  Napi::Value Matcha(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string url = info[0].As<Napi::String>();
    std::string srcHost = info[1].As<Napi::String>();
    uint32_t typ = typAvStrang(info[2].As<Napi::String>());
    bool tredje = info[3].As<Napi::Boolean>();
    for (char& c : srcHost) c = lower(c);
    Beslut b = motor.matcha(url, srcHost, typ, tredje);
    Napi::Object o = Napi::Object::New(env);
    o.Set("block", Napi::Boolean::New(env, b.block));
    o.Set("redirect", Napi::String::New(env, b.redirect ? *b.redirect : std::string()));
    return o;
  }
  Napi::Value Antal(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), (double)(motor.block.size() + motor.tillat.size()));
  }
  // Returnerar en Buffer med det tolkade tillståndet (för diskcache)
  Napi::Value Serialisera(const Napi::CallbackInfo& info) {
    std::string s = motor.serialisera();
    return Napi::Buffer<char>::Copy(info.Env(), s.data(), s.size());
  }
  // Läser tillbaka en Buffer. true = lyckades (annars ska JS tolka om listorna).
  Napi::Value Deserialisera(const Napi::CallbackInfo& info) {
    if (!info[0].IsBuffer()) return Napi::Boolean::New(info.Env(), false);
    Napi::Buffer<char> buf = info[0].As<Napi::Buffer<char>>();
    return Napi::Boolean::New(info.Env(), motor.deserialisera(buf.Data(), buf.Length()));
  }
};

Napi::Object InitAll(Napi::Env env, Napi::Object exports) { return Adblock::Init(env, exports); }
NODE_API_MODULE(adblock_core, InitAll)
