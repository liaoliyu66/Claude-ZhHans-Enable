/**
 * Quantumult X — 网易云 VIP/无版权曲目音源替换
 * 拦截: POST /eapi/song/enhance/player/url/v1
 * 类型: script-response-body
 *
 * 逻辑: 响应里 url 为空的曲目，换成第三方音源地址；客户端播放器会自行跟随 302。
 *       url 已存在的（免费曲/已购）原样放行。
 */
const SRC_FLAC = "https://api.qijieya.cn/meting/?type=url&id=";   // 优先，多数曲目给 FLAC
const SRC_MP3  = "https://api.injahow.cn/meting/?type=url&id=";   // 兜底，128k MP3

const LEVEL_BR = { standard: 128000, higher: 192000, exhigh: 320000,
                   lossless: 999000, hires: 999000, jyeffect: 999000, jymaster: 999000 };

function patch(item, url, type, level) {
  item.url = url;
  item.code = 200;
  item.fee = 0;
  item.payed = 1;
  item.flag = 0;
  item.md5 = null;
  item.size = 0;
  item.br = LEVEL_BR[level] || 320000;
  item.level = level;
  item.type = type;
  item.encodeType = type;
  item.freeTrialInfo = null;
  item.freeTrialPrivilege = {
    resConsumable: false, userConsumable: false, listenType: null,
    cannotListenReason: null, playReason: null, freeLimitTagType: null
  };
  item.freeTimeTrialPrivilege = { resConsumable: false, userConsumable: false, type: 0, remainTime: 0 };
  return item;
}

/** HEAD 探测真实文件类型；失败回退到直连链接 */
function probe(sid, level) {
  const want = /lossless|hires|jyeffect|jymaster/.test(level) ? SRC_FLAC : SRC_MP3;
  return $task.fetch({
    url: want + sid,
    method: "HEAD",
    headers: { "User-Agent": "Mozilla/5.0" },
    opts: { redirection: false }
  }).then(res => {
    const h = res.headers || {};
    const loc = h.Location || h.location || "";
    if (/\.flac(\?|$)/i.test(loc)) return { url: loc, type: "flac" };
    if (/\.(mp3|m4a|aac)(\?|$)/i.test(loc)) return { url: loc, type: "mp3" };
    return { url: want + sid, type: /flac/i.test(want) ? "flac" : "mp3" };
  }).catch(() => ({ url: want + sid, type: /flac/i.test(want) ? "flac" : "mp3" }));
}

(async () => {
  let body;
  try {
    body = JSON.parse($response.body);
  } catch (e) {
    return $done({});
  }
  const list = Array.isArray(body.data) ? body.data : (body.data ? [body.data] : []);
  const todo = list.filter(it => it && !it.url && it.id);
  if (!todo.length) return $done({});

  for (const it of todo) {
    const sid = String(it.id);
    const level = it.level || "exhigh";
    const src = /lossless|hires|jyeffect|jymaster/.test(level) ? SRC_FLAC : SRC_MP3;
    try {
      const r = await probe(sid, level);
      patch(it, r.url || src + sid, r.type || "mp3", level);
      console.log(`[netease-vip] ${sid} -> ${r.type} ${String(r.url).slice(0, 60)}`);
    } catch (e) {
      patch(it, src + sid, "mp3", level);
    }
  }
  $done({ body: JSON.stringify(body) });
})();
