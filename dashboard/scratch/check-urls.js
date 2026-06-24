async function check() {
  const url1 = "https://eepzfmogumogmcbqzkvz.supabase.co/storage/v1/object/public/clerical-documents/invoices/1781172178713_H_T6-182-_XPANDER_51H481.20.pdf";
  const url2 = "https://eepzfmogumogmcbqzkvz.supabase.co/storage/v1/object/public/clerical-documents/invoices/1781172190275_HOA_DON_HPK.pdf";

  try {
    const res1 = await fetch(url1, { method: 'HEAD' });
    console.log("URL 1:", res1.status, res1.statusText);
  } catch (err) {
    console.error("URL 1 error:", err);
  }

  try {
    const res2 = await fetch(url2, { method: 'HEAD' });
    console.log("URL 2:", res2.status, res2.statusText);
  } catch (err) {
    console.error("URL 2 error:", err);
  }
}

check();
