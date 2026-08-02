"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { supabase } from "@/lib/supabase";
import { fetchDepartments } from "@/lib/departments";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  Search,
  MapPin,
  Navigation,
  Globe,
  X,
  Building2,
  Loader2,
  Layers,
  CircleDot,
  MapPinOff,
  Settings2,
  Map as MapIcon,
} from "lucide-react";
import type { Located, ProjectItem } from "./types";
import LocationEditor from "./LocationEditor";

// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu.
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

// Màu marker theo trạng thái dự án.
const STATUS_META: Record<string, { color: string; label: string }> = {
  active: { color: "#005BAC", label: "Đang thi công" },
  completed: { color: "#22C55E", label: "Hoàn thành" },
  planning: { color: "#F59E0B", label: "Chuẩn bị" },
  paused: { color: "#EF4444", label: "Tạm dừng" },
};
function statusMeta(status: string | null) {
  return STATUS_META[(status || "active").toLowerCase()] || STATUS_META.active;
}

// Chèn tên dự án vào HTML của icon -> phải khử ký tự đặc biệt.
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
  );
}

// Tên ngắn hiển thị cạnh pin: bỏ tiền tố dài dòng, cắt bớt nếu quá dài.
function shortLabel(name: string): string {
  const s = (name || "")
    .replace(/^(ban\s*điều\s*hành|bđh|dự\s*án|công\s*trình)\s+/i, "")
    .trim();
  return s.length > 30 ? `${s.slice(0, 29).trimEnd()}…` : s;
}

// Pin SVG bo tròn theo màu trạng thái (tránh lỗi icon mặc định của Leaflet khi bundle),
// kèm nhãn tên dự án nổi ngay trên đầu pin cho dễ nhận diện khi không mở panel.
function pinIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;">
        <div style="max-width:170px;margin-bottom:3px;padding:2px 7px;border-radius:8px;background:rgba(255,255,255,.95);border:1px solid rgba(148,163,184,.4);box-shadow:0 1px 4px rgba(15,23,42,.2);font-family:Inter,system-ui,sans-serif;font-size:11px;font-weight:700;line-height:1.35;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(
          label
        )}</div>
        <svg width="30" height="40" viewBox="0 0 30 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/>
          <circle cx="15" cy="15" r="6" fill="white"/>
        </svg>
      </div>`,
    iconSize: [30, 40],
    iconAnchor: [0, 0],
  });
}

// Tên hiển thị của dự án: ưu tiên tên đầy đủ, mặc định là tên BĐH.
const displayName = (p: ProjectItem) => p.loc?.name || p.bdhName;

// Khung nhìn tập trung vào Việt Nam (đất liền + Biển Đông gồm Hoàng Sa/Trường Sa).
const VN_FIT: L.LatLngBoundsExpression = [
  [8.2, 102.4],
  [23.4, 114.6],
];
// Giới hạn kéo bản đồ — không cho lang thang ra cả châu Á.
const VN_MAXBOUNDS: L.LatLngBoundsExpression = [
  [2.5, 97.5],
  [26.5, 121.5],
];

// Các nền bản đồ (đều miễn phí, KHÔNG cần API key). Mỗi nền có thể gồm nhiều lớp
// chồng lên nhau (VD Vệ tinh = ảnh + lớp nhãn địa danh/đường như Google Hybrid).
type BaseKey = "voyager" | "satellite" | "topo" | "dark";
type BaseLayerDef = { label: string; layers: { url: string; options: L.TileLayerOptions }[] };

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const BASE_LAYERS: Record<BaseKey, BaseLayerDef> = {
  voyager: {
    label: "Đường phố",
    layers: [
      {
        url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        options: { subdomains: "abcd", maxZoom: 20, attribution: "© OpenStreetMap © CARTO" },
      },
    ],
  },
  satellite: {
    label: "Vệ tinh",
    layers: [
      {
        url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
        options: { maxZoom: 19, attribution: "© Esri, Maxar, Earthstar Geographics" },
      },
      // Chỉ chồng nhãn địa danh cấp cao (tỉnh/thành + nước lân cận) ở mức phóng
      // tổng quan (đến zoom 8). Phóng sâu vào công trường -> nhãn tự ẩn cho đỡ rối.
      // Không dùng lớp đường (World_Transportation) để tránh mạng đường chằng chịt.
      {
        url: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
        options: { maxZoom: 8 },
      },
    ],
  },
  topo: {
    label: "Địa hình",
    layers: [
      {
        url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
        options: { maxZoom: 19, attribution: "© Esri" },
      },
    ],
  },
  dark: {
    label: "Nền tối",
    layers: [
      {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        options: { subdomains: "abcd", maxZoom: 20, attribution: "© OpenStreetMap © CARTO" },
      },
    ],
  },
};

export default function ProjectMap() {
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const tilesRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const user = useCurrentUser();
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProjectItem | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [provinceFilter, setProvinceFilter] = useState("");
  const [baseLayer, setBaseLayer] = useState<BaseKey>("voyager");

  // ─── Nạp dữ liệu: danh sách BĐH (departments) + phần định vị (project_locations) ───
  const loadData = useCallback(async () => {
    const [depts, locRes] = await Promise.all([
      fetchDepartments(),
      supabase
        .from("project_locations")
        .select(
          "id,bdh_name,name,package,investor,progress,status,project_type,province,lat,lng,kml_url,google_earth_url"
        ),
    ]);

    if (locRes.error) setLoadError(locRes.error.message);
    const located = (locRes.data as Located[]) || [];

    // Gộp toạ độ vào danh sách BĐH theo tên (chuẩn hoá để khớp không phân biệt dấu/hoa).
    const byBdh = new Map<string, Located>();
    located.forEach((l) => byBdh.set(normalize(l.bdh_name), l));

    const merged: ProjectItem[] = depts.bdh.map((bdhName) => ({
      bdhName,
      loc: byBdh.get(normalize(bdhName)) || null,
    }));

    // Dòng project_locations có bdh_name không nằm trong danh sách BĐH -> vẫn hiển thị.
    located.forEach((l) => {
      if (!depts.bdh.some((b) => normalize(b) === normalize(l.bdh_name))) {
        merged.push({ bdhName: l.bdh_name, loc: l });
      }
    });

    setItems(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const locatedCount = useMemo(() => items.filter((i) => i.loc).length, [items]);

  // Các tỉnh/thành thực sự có dự án (dùng cho dropdown lọc) — theo danh sách sáp nhập 2025.
  const availableProvinces = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.loc?.province) set.add(i.loc.province);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  }, [items]);

  // ─── Lọc client-side theo tỉnh + từ khoá (tên BĐH / dự án / gói thầu / chủ đầu tư) ───
  const filtered = useMemo(() => {
    const q = normalize(query);
    return items.filter((p) => {
      if (provinceFilter && p.loc?.province !== provinceFilter) return false;
      if (!q) return true;
      const hay = normalize(
        [p.bdhName, p.loc?.name, p.loc?.package, p.loc?.investor, p.loc?.province, p.loc?.project_type]
          .filter(Boolean)
          .join(" ")
      );
      return hay.includes(q);
    });
  }, [items, query, provinceFilter]);

  const locatedItems = useMemo(() => filtered.filter((i) => i.loc), [filtered]);

  // ─── Khởi tạo bản đồ một lần ───
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      minZoom: 5,
      maxZoom: 19, // cần thiết cho markerCluster (tile nạp ở effect riêng, sau lúc này)
      maxBounds: VN_MAXBOUNDS,
      maxBoundsViscosity: 0.85,
      zoomAnimation: true,
    });
    map.fitBounds(VN_FIT); // mở ra là thấy Việt Nam, không phải cả châu Á
    L.control.zoom({ position: "bottomright" }).addTo(map);
    // Nền bản đồ nạp ở effect riêng bên dưới theo lựa chọn baseLayer (switcher).

    // ─── Chủ quyền Việt Nam: quần đảo Hoàng Sa & Trường Sa ───
    // Nhãn chữ trắng viền mờ (halo) như nhãn bản đồ thật — đọc rõ trên mọi nền
    // (vệ tinh / đường phố / tối), bỏ hộp nền cho thanh thoát.
    const sovLabel = (main: string) =>
      L.divIcon({
        className: "",
        html: `<div style="transform:translate(-50%,-50%);text-align:center;white-space:nowrap;color:#fff;font-family:Inter,system-ui,sans-serif;text-shadow:0 0 3px rgba(0,0,0,.95),0 1px 3px rgba(0,0,0,.85);pointer-events:none;">
          <div style="font-weight:800;font-size:12px;letter-spacing:.4px;">${main}</div>
          <div style="font-weight:600;font-size:9px;opacity:.92;letter-spacing:.3px;">(Việt Nam)</div>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
    L.marker([16.6, 112.0], {
      icon: sovLabel("Quần đảo Hoàng Sa"),
      interactive: false,
      keyboard: false,
      zIndexOffset: 500,
    }).addTo(map);
    L.marker([9.5, 113.8], {
      icon: sovLabel("Quần đảo Trường Sa"),
      interactive: false,
      keyboard: false,
      zIndexOffset: 500,
    }).addTo(map);

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
    });
    map.addLayer(cluster);

    mapRef.current = map;
    clusterRef.current = cluster;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      tilesRef.current = null;
    };
  }, []);

  // ─── Nạp/đổi nền bản đồ theo lựa chọn (mỗi nền có thể gồm nhiều lớp chồng) ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tilesRef.current) {
      map.removeLayer(tilesRef.current);
      tilesRef.current = null;
    }
    const cfg = BASE_LAYERS[baseLayer];
    const tiles = cfg.layers.map((l, i) => {
      const t = L.tileLayer(l.url, l.options);
      t.setZIndex(i); // lớp sau (nhãn/đường) nằm trên ảnh nền
      return t;
    });
    tilesRef.current = L.layerGroup(tiles).addTo(map);
  }, [baseLayer]);

  // ─── Dựng lại marker mỗi khi danh sách (đã định vị) đổi ───
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;

    cluster.clearLayers();
    const markers: L.Marker[] = [];
    locatedItems.forEach((p) => {
      const loc = p.loc!;
      const m = L.marker([loc.lat, loc.lng], {
        icon: pinIcon(statusMeta(loc.status).color, shortLabel(displayName(p))),
      });
      m.on("click", () => {
        setSelected(p);
        map.flyTo([loc.lat, loc.lng], Math.max(map.getZoom(), 13), { duration: 0.6 });
      });
      markers.push(m);
      cluster.addLayer(m);
    });

    if (markers.length > 0 && !query) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.2), { animate: false });
    }
  }, [locatedItems, query]);

  // Bấm 1 dự án trong kết quả tìm kiếm.
  function focusProject(p: ProjectItem) {
    if (p.loc) {
      const map = mapRef.current;
      if (map) map.flyTo([p.loc.lat, p.loc.lng], 14, { duration: 0.7 });
    }
    setSelected(p);
    setSearchFocused(false);
  }

  // Quyền gán toạ độ — dùng cả cho nút "Quản lý vị trí" lẫn việc chừa chỗ cho
  // nó trên thanh tìm kiếm ở mobile.
  const canManageLocations = user.isAdmin || user.perms.canManageProjectLocations;

  const directionsUrl = (l: Located) =>
    `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`;
  const earthUrl = (l: Located) =>
    l.google_earth_url ||
    `https://earth.google.com/web/@${l.lat},${l.lng},500a,2000d,35y,0h,0t,0r`;

  return (
    <div className="absolute inset-0">
      {/* Bản đồ */}
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* Bảng gán vị trí */}
      {editorOpen && (
        <LocationEditor
          items={items}
          email={user.email}
          onClose={() => setEditorOpen(false)}
          onSaved={loadData}
        />
      )}

      {/* Thanh tìm kiếm nổi phía trên. Đổ bóng đậm cho nổi khối trên nền bản đồ
          sáng — phải đặt inline vì class `.glass` đã tự khai báo box-shadow và
          đứng sau utility của Tailwind nên sẽ đè mất class shadow-[...]. */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] w-[92%] max-w-md">
        <div
          className="glass rounded-2xl border border-slate-200/60 overflow-hidden"
          style={{
            boxShadow:
              "0 14px 36px -10px rgba(15,23,42,0.38), 0 4px 10px -4px rgba(15,23,42,0.18)",
          }}
        >
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              placeholder="Tìm dự án / BĐH / gói thầu / chủ đầu tư..."
              className="flex-1 bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-slate-400 hover:text-rose-500 transition-colors"
                title="Xoá tìm kiếm"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Bộ đếm định vị */}
          {!loading && items.length > 0 && (
            <div className="px-4 pb-2 -mt-1">
              <span className="text-[10px] font-bold text-slate-400">
                Đã định vị <span className="text-[#005BAC]">{locatedCount}</span>/{items.length} dự án
              </span>
            </div>
          )}

          {/* Lọc theo tỉnh/thành (chỉ hiện tỉnh có dự án — danh sách sáp nhập 2025) */}
          {availableProvinces.length > 0 && (
            <div className="px-3 pb-3 pt-0.5">
              <select
                value={provinceFilter}
                onChange={(e) => setProvinceFilter(e.target.value)}
                className="w-full text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#00AEEF]"
              >
                <option value="">Tất cả tỉnh/thành ({locatedCount})</option>
                {availableProvinces.map((pv) => {
                  const c = items.filter((i) => i.loc?.province === pv).length;
                  return (
                    <option key={pv} value={pv}>
                      {pv} ({c})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Danh sách kết quả gợi ý (gồm cả dự án chưa định vị) */}
          {searchFocused && query && (
            <div className="max-h-64 overflow-y-auto border-t border-slate-100 bg-white/95">
              {filtered.length === 0 ? (
                <p className="text-slate-400 text-xs italic text-center py-5">
                  Không tìm thấy dự án phù hợp
                </p>
              ) : (
                filtered.slice(0, 25).map((p) => {
                  const meta = p.loc ? statusMeta(p.loc.status) : null;
                  return (
                    <button
                      key={p.bdhName}
                      onClick={() => focusProject(p)}
                      className="w-full flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors border-b border-slate-50 last:border-0"
                    >
                      {p.loc ? (
                        <MapPin size={14} style={{ color: meta!.color }} className="mt-0.5 shrink-0" />
                      ) : (
                        <MapPinOff size={14} className="mt-0.5 shrink-0 text-slate-300" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{displayName(p)}</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate">
                          {p.loc
                            ? [p.loc.package, p.loc.province].filter(Boolean).join(" · ") || p.bdhName
                            : "Chưa có toạ độ"}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Điều khiển góc trái-dưới: chọn nền bản đồ + chú thích trạng thái */}
      <div className="absolute bottom-4 left-4 z-[500] flex flex-col gap-2 items-start max-w-[calc(100%-2rem)]">
        {/* Nút quản lý vị trí (Admin hoặc tài khoản có cờ quản lý vị trí).
            Đặt ngay trên bộ chọn nền bản đồ để không bị thanh tìm kiếm đè
            trên màn hình điện thoại. */}
        {canManageLocations && (
          <button
            onClick={() => setEditorOpen(true)}
            className="glass rounded-2xl shadow-premium border border-slate-200/60 flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-[#005BAC] hover:bg-blue-50 transition-all active:scale-[0.97]"
            title="Gán toạ độ / link cho dự án"
          >
            <Settings2 size={15} className="shrink-0" /> Quản lý vị trí
          </button>
        )}

        {/* Bộ chọn nền bản đồ (mọi người dùng) */}
        <div className="glass rounded-2xl shadow-premium border border-slate-200/60 p-1.5 flex flex-wrap gap-1">
          {(Object.keys(BASE_LAYERS) as BaseKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setBaseLayer(k)}
              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition-all active:scale-[0.97] ${
                baseLayer === k
                  ? "bg-gradient-to-r from-[#005BAC] to-[#00AEEF] text-white shadow-sm shadow-blue-500/20"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {BASE_LAYERS[k].label}
            </button>
          ))}
        </div>

        {/* Bảng tổng quan (desktop): thương hiệu + số liệu + chú thích trạng
            thái gộp chung MỘT khối cho gọn. */}
        <div className="hidden md:block glass rounded-2xl shadow-premium border border-slate-200/60 p-3.5 w-72">
          {/* Thương hiệu */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/25 shrink-0">
              <MapPin size={15} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-heading font-extrabold text-xs text-slate-800 leading-tight">Bản đồ dự án</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Trung Nam E&C</p>
            </div>
          </div>

          {/* Số liệu tổng quan */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2 text-center">
              <p className="text-xl font-heading font-extrabold text-slate-800 leading-none">{items.length}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mt-1">Dự án</p>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-2.5 py-2 text-center">
              <p className="text-xl font-heading font-extrabold text-[#005BAC] leading-none">{locatedCount}</p>
              <p className="text-[9px] text-[#005BAC]/70 font-bold uppercase tracking-wide mt-1">Đã định vị</p>
            </div>
          </div>

          {/* Chú thích trạng thái — xếp 2 cột cho khối đỡ dài */}
          <div className="mt-3 pt-3 border-t border-slate-200/60">
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
              <Layers size={12} /> Trạng thái
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {Object.entries(STATUS_META).map(([k, v]) => {
                const count = items.filter(
                  (i) => i.loc && (i.loc.status || "active").toLowerCase() === k
                ).length;
                return (
                  <div key={k} className="flex items-center gap-1.5 min-w-0">
                    <CircleDot size={12} style={{ color: v.color }} className="shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-600 flex-1 truncate">{v.label}</span>
                    <span className="text-[11px] font-bold text-slate-400 tabular-nums shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Trạng thái tải / lỗi / chưa định vị */}
      {loading && (
        <div className="absolute inset-0 z-[600] flex items-center justify-center bg-white/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <Loader2 className="animate-spin text-[#005BAC]" size={30} />
            <p className="text-xs font-semibold">Đang tải dự án...</p>
          </div>
        </div>
      )}
      {!loading && loadError && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[550] bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-sm">
          Lỗi tải dữ liệu: {loadError}
        </div>
      )}
      {!loading && !loadError && items.length > 0 && locatedCount === 0 && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[550] bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-sm text-center max-w-xs">
          {items.length} dự án (BĐH) đang chờ toạ độ. Nhập vị trí để hiển thị marker trên bản đồ.
        </div>
      )}

      {/* Bottom sheet chi tiết dự án */}
      {selected && (
        <>
          <div
            onClick={() => setSelected(null)}
            className="absolute inset-0 z-[700] bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          />
          <div className="absolute z-[750] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto">
            {/* Đầu panel */}
            <div className="sticky top-0 bg-white/95 backdrop-blur px-6 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3.5">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md"
                style={{ backgroundColor: selected.loc ? statusMeta(selected.loc.status).color : "#94A3B8" }}
              >
                <Building2 size={22} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-heading font-extrabold text-base text-slate-800 leading-tight">
                  {displayName(selected)}
                </h3>
                {selected.loc ? (
                  <span
                    className="inline-block mt-1.5 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full"
                    style={{
                      color: statusMeta(selected.loc.status).color,
                      backgroundColor: `${statusMeta(selected.loc.status).color}14`,
                    }}
                  >
                    {statusMeta(selected.loc.status).label}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full text-slate-500 bg-slate-100">
                    <MapPinOff size={11} /> Chưa định vị
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-rose-500 transition-colors shrink-0 p-1 -m-1"
                title="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            {selected.loc ? (
              <>
                {/* Thông tin */}
                <div className="px-6 py-5 space-y-3.5">
                  {[
                    { label: "Ban điều hành", value: selected.bdhName },
                    { label: "Gói thầu", value: selected.loc.package },
                    { label: "Chủ đầu tư", value: selected.loc.investor },
                    { label: "Loại dự án", value: selected.loc.project_type },
                    { label: "Tỉnh / Thành", value: selected.loc.province },
                    { label: "Tiến độ", value: selected.loc.progress },
                  ]
                    .filter((r) => r.value)
                    .map((r) => (
                      <div key={r.label} className="flex gap-3">
                        <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider w-24 sm:w-28 shrink-0 pt-0.5">
                          {r.label}
                        </span>
                        <span className="text-sm font-semibold text-slate-700 flex-1">{r.value}</span>
                      </div>
                    ))}
                  <div className="flex gap-3">
                    <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider w-24 sm:w-28 shrink-0 pt-0.5">
                      Toạ độ
                    </span>
                    <span className="text-sm font-mono font-semibold text-slate-500 flex-1">
                      {selected.loc.lat.toFixed(5)}, {selected.loc.lng.toFixed(5)}
                    </span>
                  </div>
                </div>

                {/* Nút hành động */}
                <div className="px-6 pb-6 pt-1 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <a
                      href={directionsUrl(selected.loc)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-[#005BAC] hover:bg-blue-700 active:scale-[0.98] text-white text-sm font-bold py-3.5 rounded-xl shadow-md shadow-blue-500/15 transition-all"
                    >
                      <Navigation size={16} /> Chỉ đường
                    </a>
                    <a
                      href={earthUrl(selected.loc)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 text-sm font-bold py-3.5 rounded-xl transition-all"
                    >
                      <Globe size={16} /> Google Earth
                    </a>
                  </div>
                  {selected.loc.kml_url && (
                    <a
                      href={selected.loc.kml_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#005BAC] to-[#00AEEF] hover:opacity-95 active:scale-[0.98] text-white text-sm font-bold py-3.5 rounded-xl shadow-md shadow-blue-500/15 transition-all"
                    >
                      <MapIcon size={16} /> Bản đồ chi tiết (My Maps)
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  Dự án này chưa có toạ độ. Quản trị viên có thể thêm vị trí ở trang quản lý để
                  hiển thị marker và mở chỉ đường.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
