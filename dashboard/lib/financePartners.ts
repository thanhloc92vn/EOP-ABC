"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

// ============================================================
// DANH MỤC ĐỐI TÁC THANH TOÁN (migration 048)
//
// Nuôi tab "Kế hoạch thu chi" trong module Báo cáo: mỗi Ban điều hành / dự án
// có sẵn nhà thầu nào, số tài khoản, ngân hàng + chi nhánh, số hợp đồng và nội
// dung thanh toán mẫu — để lập kế hoạch tháng thì CHỌN thay vì GÕ LẠI.
//
// Cùng khuôn lib/projectCatalog.ts: cache ở tầng module nên mọi component trong
// một phiên chỉ truy vấn 1 lần, và bảng chưa tạo thì trả rỗng chứ KHÔNG ném lỗi
// làm sập cả trang Báo cáo.
//
// KHÁC projectCatalog một điểm: ở đây có `reload()` trả về lỗi thật cho màn hình
// quản trị hiển thị. Panel cần phân biệt "chưa chạy migration 048" với "danh mục
// rỗng" — hai thứ này nhìn giống hệt nhau nếu nuốt hết lỗi.
// ============================================================

export type PartyType = "nha_thau_phu" | "nha_cung_cap" | "chu_dau_tu" | "ca_nhan";

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  nha_thau_phu: "Nhà thầu phụ",
  nha_cung_cap: "Nhà cung cấp",
  chu_dau_tu: "Chủ đầu tư",
  ca_nhan: "Cá nhân",
};

export type FinancePartner = {
  id: string;
  name: string;
  short_name: string | null;
  party_type: PartyType;
  tax_code: string | null;
  bank_account: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  note: string | null;
  active: boolean;
  sort_order: number;
};

export type FinancePartnerContract = {
  id: string;
  partner_id: string;
  project_code: string | null;
  project_name: string | null;
  contract_no: string | null;
  default_content: string | null;
  flow: "thu" | "chi";
  department: string | null;
  active: boolean;
  sort_order: number;
};

// ─── Tài khoản ngân hàng (migration 059) ───
// Một đối tác có N tài khoản; một dòng hợp đồng dùng 1 hoặc nhiều tài khoản
// trong số đó (gói thầu thỉnh thoảng chia tiền về 2 nơi). Ba cột bank_* còn lại
// trên `finance_partners` là dữ liệu chết, giữ để đối chiếu — đừng đọc nữa.
export type FinancePartnerAccount = {
  id: string;
  partner_id: string;
  label: string | null;
  bank_account: string;
  bank_name: string | null;
  bank_branch: string | null;
  is_default: boolean;
  active: boolean;
  sort_order: number;
};

export type ContractAccountLink = {
  contract_id: string;
  account_id: string;
};

export type FinancePartnerData = {
  partners: FinancePartner[];
  contracts: FinancePartnerContract[];
  accounts: FinancePartnerAccount[];
  contractAccounts: ContractAccountLink[];
  loading: boolean;
  error: string;
  /** Lỗi RIÊNG của 2 bảng ở 059. Tách khỏi `error` vì nó KHÔNG chặn màn hình:
   *  chưa chạy migration thì danh mục cũ vẫn xem được, chỉ mất phần tài khoản. */
  accountsError: string;
};

const EMPTY: FinancePartnerData = {
  partners: [], contracts: [], accounts: [], contractAccounts: [],
  loading: true, error: "", accountsError: "",
};

const PARTNER_COLS =
  "id, name, short_name, party_type, tax_code, bank_account, bank_name, bank_branch, note, active, sort_order";
const CONTRACT_COLS =
  "id, partner_id, project_code, project_name, contract_no, default_content, flow, department, active, sort_order";
const ACCOUNT_COLS =
  "id, partner_id, label, bank_account, bank_name, bank_branch, is_default, active, sort_order";

let cached: FinancePartnerData | null = null;
let inflight: Promise<FinancePartnerData> | null = null;

export async function fetchFinancePartners(): Promise<FinancePartnerData> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      // Bốn truy vấn song song — danh mục nhỏ, đừng bắt màn hình chờ nối tiếp.
      const [pRes, cRes, aRes, lRes] = await Promise.all([
        supabase
          .from("finance_partners")
          .select(PARTNER_COLS)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("finance_partner_contracts")
          .select(CONTRACT_COLS)
          .order("project_code", { ascending: true })
          .order("sort_order", { ascending: true }),
        supabase
          .from("finance_partner_accounts")
          .select(ACCOUNT_COLS)
          // Tài khoản mặc định luôn đứng đầu danh sách của đối tác đó.
          .order("is_default", { ascending: false })
          .order("sort_order", { ascending: true }),
        supabase
          .from("finance_contract_accounts")
          .select("contract_id, account_id"),
      ]);

      // Hai bảng của 059 CHƯA CHẠY MIGRATION thì chỉ trả rỗng, KHÔNG tính là
      // lỗi: màn hình vẫn xem được danh mục cũ thay vì đỏ rực toàn trang.
      const error = pRes.error || cRes.error;
      const result: FinancePartnerData = {
        partners: (pRes.error ? [] : pRes.data || []) as FinancePartner[],
        contracts: (cRes.error ? [] : cRes.data || []) as FinancePartnerContract[],
        accounts: (aRes.error ? [] : aRes.data || []) as unknown as FinancePartnerAccount[],
        contractAccounts: (lRes.error ? [] : lRes.data || []) as unknown as ContractAccountLink[],
        loading: false,
        error: error ? error.message : "",
        accountsError: aRes.error?.message || lRes.error?.message || "",
      };
      // Lỗi thì KHÔNG cache — để lần mở sau còn thử lại, thay vì kẹt màn hình
      // lỗi suốt phiên chỉ vì một cú mạng chập.
      if (!error) cached = result;
      return result;
    } catch (e) {
      return {
        ...EMPTY,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// Gọi sau mỗi lần ghi, để lần đọc kế tiếp lấy dữ liệu mới mà không cần F5.
export function invalidateFinancePartners(): void {
  cached = null;
}

export function useFinancePartners(): FinancePartnerData & { reload: () => Promise<void> } {
  const [data, setData] = useState<FinancePartnerData>(cached || EMPTY);

  const reload = useCallback(async () => {
    invalidateFinancePartners();
    setData(prev => ({ ...prev, loading: true }));
    setData(await fetchFinancePartners());
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchFinancePartners().then(d => { if (mounted) setData(d); });
    return () => { mounted = false; };
  }, []);

  return { ...data, reload };
}

// ─── Bỏ dấu để tìm kiếm ───
// Gõ "yen phuc" phải ra "Yên Phúc". Dùng cho ô tìm trong panel danh mục.
export function foldVi(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
