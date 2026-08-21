// ============================================================
// crumpleToss — hiệu ứng "vò giấy thả vào sọt rác" khi xoá một dòng.
//
// Dùng ở module Báo cáo (/bao-cao): danh sách phiếu trình ký và danh mục đối
// tác. KHÔNG có Undo: cả hai bảng đều xoá cứng ở DB, dựng nút Undo mà không có
// xoá mềm là hứa suông.
//
// CHUYỂN ĐỘNG THUẦN DỌC: sọt rác rơi từ trên xuống, đỗ ngay dưới nút Xoá vừa
// bấm; cục giấy vò tại chỗ rồi thả thẳng đứng vào sọt. Bản trước ném vòng cung
// ngang qua cả bảng — đường bay dài, mắt phải đuổi theo, và ở bảng rộng thì
// đỉnh cung chạm mép trên màn hình.
//
// VIẾT BẰNG DOM THUẦN, không phải component React. Lý do: hiệu ứng cần toạ độ
// thật của dòng ngay lúc bấm và phải sống sót qua đúng cái khoảnh khắc React gỡ
// dòng đó khỏi cây. Nhét vào state thì mỗi lần danh sách nạp lại là animation
// bị cắt ngang. Cục giấy + sọt rác đều gắn thẳng vào document.body nên không bị
// `overflow-hidden` của thẻ card cắt mất.
//
// CÁCH DÙNG (3 nhịp, phải đủ cả 3 nếu không dòng sẽ kẹt ở trạng thái đã co lại):
//   const toss = crumpleToss(rowEl, { origin: btn });  // bấm xoá
//   toss.done("Đã xoá phiếu ABC");                     // xoá xong → toast
//   toss.cancel();                                     // xoá lỗi → trả dòng về
//
// Phần nhìn (hình cục giấy, sọt, toast) nằm ở globals.css — cùng chỗ với
// confetti sinh nhật, để mọi keyframes của dự án ở một nơi.
// ============================================================

export type TossHandle = {
  /** Xoá thành công: hiện toast. Gọi sớm hơn lúc giấy rơi vào sọt cũng được — toast tự đợi. */
  done: (msg?: string) => void;
  /** Xoá thất bại / RLS chặn: huỷ animation và bung dòng trở lại. */
  cancel: () => void;
};

const Z = 1000;
// Vò giấy tại chỗ rồi mới thả: hai nhịp tách bạch, cộng lại là tổng thời gian.
const CRUMPLE_MS = 130;
const FALL_MS = 380;
const TOTAL_MS = CRUMPLE_MS + FALL_MS;
// Sọt phải chạm đất TRƯỚC khi giấy rơi tới, nếu không giấy xuyên qua chỗ trống.
const BIN_DROP_MS = 360;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ─── Sọt rác ───
// Một cái duy nhất dùng chung cho cả trang, mỗi lần xoá lại dời tới ngay dưới
// dòng vừa bấm rồi rơi từ trên xuống. Chỉ hiện trong lúc xoá rồi rơi tuột đi:
// để thường trực thì thành một món đồ trang trí lạ giữa giao diện quản trị.
function dropBin(x: number, top: number): { bin: HTMLElement; mouth: { x: number; y: number } } {
  let bin = document.getElementById("toss-bin");
  if (!bin) {
    bin = document.createElement("div");
    bin.id = "toss-bin";
    bin.className = "toss-bin";
    bin.innerHTML = `
      <span class="toss-bin-lid"></span>
      <span class="toss-bin-body"><i></i><i></i><i></i></span>`;
    document.body.appendChild(bin);
  }

  bin.style.left = `${x - 26}px`; // 26 = nửa bề ngang sọt, để tâm sọt đúng trục rơi
  bin.style.top = `${top}px`;
  bin.style.zIndex = String(Z);
  bin.classList.add("toss-bin-on");

  // fill "none" (mặc định): animation kết thúc là sọt về đúng transform gốc,
  // nhờ vậy cú bẹp lúc giấy chạm đáy không phải giành transform với animation
  // rơi còn treo lại.
  bin.animate(
    [
      { transform: "translateY(-96px) scale(.92)", opacity: 0 },
      { transform: "translateY(0) scale(1)", opacity: 1, offset: 0.72, easing: "cubic-bezier(.4,0,.7,1)" },
      { transform: "translateY(-7px) scale(1.03,.97)", offset: 0.86 },
      { transform: "translateY(0) scale(1)" },
    ],
    { duration: BIN_DROP_MS, easing: "linear" }
  );

  const r = bin.getBoundingClientRect();
  return { bin, mouth: { x: r.left + r.width / 2, y: top + 16 } };
}

// Sọt rơi tuột xuống rồi biến mất — vào bằng đường nào ra bằng đường nấy.
function dismissBin() {
  const bin = document.getElementById("toss-bin");
  if (!bin) return;
  bin.animate(
    [{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(70px)", opacity: 0 }],
    { duration: 300, easing: "cubic-bezier(.5,0,.9,.6)" }
  );
  bin.classList.remove("toss-bin-on");
}

// Bụi bay lúc giấy chạm đáy sọt — 6 hạt tản ra hai bên rồi tan.
function puffDust(x: number, y: number) {
  for (let i = 0; i < 6; i++) {
    const d = document.createElement("span");
    d.className = "toss-dust";
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.zIndex = String(Z);
    document.body.appendChild(d);
    const dx = (i - 2.5) * 9 + (Math.random() * 6 - 3);
    d.animate(
      [
        { transform: "translate(-50%,-50%) scale(.4)", opacity: 0.9 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% - ${12 + Math.random() * 14}px)) scale(1)`, opacity: 0 },
      ],
      { duration: 460 + Math.random() * 160, easing: "cubic-bezier(.2,.7,.4,1)" }
    ).onfinish = () => d.remove();
  }
}

// ─── Toast ───
// Tự đóng sau 2.6s. Không có nút đóng: thông báo một dòng, thêm nút chỉ tổ rối.
function showToast(msg: string) {
  const t = document.createElement("div");
  t.className = "toss-toast";
  t.style.zIndex = String(Z + 1);
  t.textContent = msg;
  document.body.appendChild(t);
  window.setTimeout(() => {
    t.classList.add("toss-toast-out");
    window.setTimeout(() => t.remove(), 220);
  }, 2600);
}

export function crumpleToss(
  row: HTMLElement | null,
  opts: { origin?: HTMLElement | null; toast?: boolean } = {}
): TossHandle {
  const wantToast = opts.toast !== false;
  if (typeof window === "undefined" || !row || !row.isConnected) {
    return { done: (m) => m && wantToast && showToast(m), cancel: () => {} };
  }

  // Người dùng bật "giảm chuyển động" của hệ điều hành: bỏ giấy rơi, chỉ mờ dòng.
  if (reducedMotion()) {
    row.style.transition = "opacity .18s linear";
    row.style.opacity = "0";
    return {
      done: (m) => m && wantToast && showToast(m),
      cancel: () => {
        if (!row.isConnected) return;
        row.style.opacity = "";
        row.style.transition = "";
      },
    };
  }

  const rect = row.getBoundingClientRect();

  // 1. Dòng co chiều cao về 0 — các dòng dưới tự trượt lên lấp chỗ.
  //    Phải chốt height bằng số px thật trước rồi mới hạ về 0: transition không
  //    chạy được từ `auto`.
  const saved = {
    height: row.style.height,
    opacity: row.style.opacity,
    overflow: row.style.overflow,
    paddingTop: row.style.paddingTop,
    paddingBottom: row.style.paddingBottom,
    transition: row.style.transition,
    pointerEvents: row.style.pointerEvents,
  };
  // Hàng của BẢNG không co được bằng `height`: trong bố cục table, height của
  // <tr> chỉ là mức TỐI THIỂU, chiều cao thật do nội dung ô quyết định. Muốn
  // hàng xẹp xuống thì phải bóp padding + line-height của từng <td>.
  const cells = row.tagName === "TR" ? (Array.from(row.children) as HTMLElement[]) : [];
  const savedCells = cells.map(c => ({
    el: c,
    padding: c.style.padding,
    lineHeight: c.style.lineHeight,
    overflow: c.style.overflow,
    transition: c.style.transition,
  }));

  row.style.height = `${rect.height}px`;
  row.style.overflow = "hidden";
  row.style.pointerEvents = "none";
  const cellTransition = "padding .3s cubic-bezier(.4,0,.2,1), line-height .3s cubic-bezier(.4,0,.2,1)";
  cells.forEach(c => { c.style.transition = cellTransition; c.style.overflow = "hidden"; });
  void row.offsetHeight; // ép trình duyệt chốt mốc trước khi đổi sang 0
  row.style.transition = "height .3s cubic-bezier(.4,0,.2,1), padding .3s cubic-bezier(.4,0,.2,1), opacity .2s linear";
  row.style.height = "0px";
  row.style.paddingTop = "0px";
  row.style.paddingBottom = "0px";
  row.style.opacity = "0";
  cells.forEach(c => { c.style.padding = "0px"; c.style.lineHeight = "0"; });

  // 2. Trục rơi = tâm nút Xoá vừa bấm. Không đoán theo bề rộng cột: hai bảng có
  //    thể đổi bố cục, mà lệch trục là giấy rơi ra ngoài miệng sọt.
  const oRect = opts.origin?.getBoundingClientRect();
  const from = {
    x: oRect ? oRect.left + oRect.width / 2 : rect.right - 44,
    y: oRect ? oRect.top + oRect.height / 2 : rect.top + rect.height / 2,
  };

  // Sọt đỗ ngay dưới dòng. Kẹp theo mép dưới khung nhìn cho dòng nằm cuối màn
  // hình, nhưng luôn giữ dưới dòng ít nhất 8px — sọt nhảy lên trên thì giấy
  // phải rơi ngược, hỏng cả ý.
  let binTop = Math.min(rect.bottom + 16, window.innerHeight - 96);
  if (binTop < rect.bottom + 8) binTop = rect.bottom + 8;
  const { bin, mouth } = dropBin(from.x, binTop);

  const ball = document.createElement("div");
  ball.className = "toss-ball";
  ball.style.left = `${from.x}px`;
  ball.style.top = `${from.y}px`;
  ball.style.zIndex = String(Z);
  document.body.appendChild(ball);

  const startOff = CRUMPLE_MS / TOTAL_MS;
  const dy = mouth.y + 12 - from.y;

  const anim = ball.animate(
    [
      // Vò tại chỗ: bung ra rồi nhàu lại, chưa rơi.
      { transform: "translate(-50%,-50%) translateY(0px) scale(.25) rotate(0deg)", opacity: 0, offset: 0, easing: "cubic-bezier(.34,1.56,.64,1)" },
      { transform: "translate(-50%,-50%) translateY(0px) scale(1.06) rotate(18deg)", opacity: 1, offset: startOff, easing: "cubic-bezier(.5,0,.85,.4)" },
      // Rơi nhanh dần như có trọng lực, xoay nhẹ theo.
      { transform: `translate(-50%,-50%) translateY(${dy}px) scale(.55) rotate(190deg)`, opacity: 1, offset: 1 },
    ],
    { duration: TOTAL_MS, fill: "forwards" }
  );

  // Nắp sọt hé mở đón giấy rồi đậy lại.
  const lid = bin.querySelector<HTMLElement>(".toss-bin-lid");
  lid?.animate(
    [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-38deg) translateY(-1px)", offset: 0.6 },
      { transform: "rotate(0deg)" },
    ],
    { duration: TOTAL_MS + 160, easing: "ease-in-out" }
  );

  let landed = false;
  let cancelled = false;
  let pending: string | null = null;

  // Giấy chạm đáy sọt: dọn cục giấy, bụi bốc lên, sọt bẹp một nhịp rồi tuột đi.
  const land = () => {
    if (cancelled || landed) return;
    landed = true;
    ball.remove();
    puffDust(mouth.x, mouth.y + 10);
    bin.animate(
      [
        { transform: "scale(1,1)" },
        { transform: "scale(1.14,.84)", offset: 0.35 },
        { transform: "scale(.96,1.05)", offset: 0.68 },
        { transform: "scale(1,1)" },
      ],
      { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)" }
    );
    if (pending !== null) showToast(pending);
    window.setTimeout(dismissBin, 620);
  };

  anim.onfinish = land;
  // Chốt dự phòng: trình duyệt ĐÓNG BĂNG animation khi tab bị ẩn, `onfinish` lúc
  // đó không bao giờ bắn. Người dùng bấm xoá rồi chuyển tab là cục giấy treo
  // giữa màn hình và toast tắc luôn. setTimeout vẫn chạy khi tab ẩn nên dùng nó
  // làm chốt hạ cánh muộn.
  window.setTimeout(land, TOTAL_MS + 300);

  return {
    done: (msg) => {
      if (!msg || !wantToast) return;
      if (landed) showToast(msg);
      else pending = msg; // giấy chưa rơi tới sọt — đợi rơi xong mới báo
    },
    cancel: () => {
      cancelled = true;
      anim.cancel();
      ball.remove();
      dismissBin();
      // Bung dòng trở lại. `isConnected`: nếu danh sách đã nạp lại trong lúc chờ
      // thì node này đã rời khỏi trang, đụng vào chỉ tổ sinh lỗi.
      if (!row.isConnected) return;
      row.style.height = `${rect.height}px`;
      row.style.paddingTop = saved.paddingTop;
      row.style.paddingBottom = saved.paddingBottom;
      row.style.opacity = "1";
      savedCells.forEach(c => { c.el.style.padding = c.padding; c.el.style.lineHeight = c.lineHeight; });
      window.setTimeout(() => {
        if (!row.isConnected) return;
        row.style.height = saved.height;
        row.style.opacity = saved.opacity;
        row.style.overflow = saved.overflow;
        row.style.transition = saved.transition;
        row.style.pointerEvents = saved.pointerEvents;
        savedCells.forEach(c => {
          c.el.style.overflow = c.overflow;
          c.el.style.transition = c.transition;
        });
      }, 320);
    },
  };
}
