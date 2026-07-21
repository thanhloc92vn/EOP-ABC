const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

function normalizeDept(deptName) {
  if (!deptName) return "";
  const d = String(deptName).toLowerCase().trim();
  if (d.includes("xuyên tâm") || d.includes("rxt")) return "rxt";
  if (d.includes("vàm lẽo") || d.includes("vàm lẻo")) return "vam_leo";
  if (d.includes("mã đà")) return "ma_da";
  if (d.includes("trà vinh") || d.includes("dmt")) return "dmt_tra_vinh";
  if (d.includes("tỉnh lộ 8") || d.includes("tl8")) return "tl8";
  if (d.includes("tây ninh")) return "tay_ninh";
  if (d.includes("chống hạn")) return "chong_han";
  if (d.includes("cà ná")) return "ca_na";
  if (d.includes("quản lý dự án") || d.includes("qlda")) return "phong_qlda";
  if (d.includes("hành chính") || d.includes("hcns") || d.includes("nhân sự")) return "phong_hcns";
  if (d.includes("kế hoạch") || d.includes("đấu thầu") || d.includes("kế toán")) {
    return d.includes("hành chính") ? "phong_hcns" : "phong_ke_hoach";
  }
  if (d.includes("an toàn") || d.includes("atld") || d.includes("atlđ")) return "phong_atld";
  if (d.includes("vật tư") || d.includes("vt-tb") || d.includes("vt tb") || d.includes("vt_tb")) return "phong_vt_tb";
  if (d.includes("kỹ thuật") || d.includes("ktht")) return "phong_ktht";
  return d;
}

function normalizeRole(roleName) {
  if (!roleName) return "";
  const r = String(roleName).toLowerCase().trim();
  if (r.includes("tuyển dụng")) return "tuyen_dung";
  if (r.includes("media")) return "media";
  if (r.includes("designer")) return "designer";
  if (r.includes("tổ trưởng") && r.includes("nhân sự")) return "to_truong_ns";
  if (r.includes("phó phòng") && (r.includes("hành chính") || r.includes("hc"))) return "pp_hanh_chinh";
  if (r.includes("hành chính") || r.includes("hành chánh") || r.includes("hcns") || r.includes("nhân sự")) return "hanh_chinh";
  if (r.includes("an toàn") || r.includes("atld") || r.includes("atlđ") || r.includes("hse") || r.includes("môi trường")) return "atld";
  if (r.includes("qlda") || r.includes("quản lý dự án") || r.includes("tổng hợp p qlda")) return "cv_qlda";
  if (r.includes("qs")) return "qs";
  if (r.includes("đấu thầu")) return "dau_thau";
  if (r.includes("kế hoạch") || r.includes("kinh tế")) return "ke_hoach";
  if (r.includes("vật tư") || r.includes("vt-tb")) return "vt_tb";
  if (r.includes("trưởng phòng") && r.includes("ktht")) return "tp_ktht";
  if (r.includes("phó phòng") && r.includes("ktht")) return "pp_ktht";
  if (r.includes("kỹ thuật") || r.includes("ktht") || r.includes("kỹ sư")) return "ktht";
  return r;
}

function parseDate(dStr) {
  if (!dStr) return null;
  const match = dStr.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  }
  return null;
}

function setCellTextPreserve(cell, text, bold = false) {
  const ts = cell.getElementsByTagName('w:t');
  if (ts.length > 0) {
    ts[0].textContent = text;
    for (let i = 1; i < ts.length; i++) {
      ts[i].textContent = "";
    }
  } else {
    const docOwner = cell.ownerDocument;
    let p = cell.getElementsByTagName('w:p')[0];
    if (!p) {
      p = docOwner.createElement('w:p');
      cell.appendChild(p);
    }
    let run = p.getElementsByTagName('w:r')[0];
    if (!run) {
      run = docOwner.createElement('w:r');
      p.appendChild(run);
    }
    if (bold) {
      let rPr = run.getElementsByTagName('w:rPr')[0];
      if (!rPr) {
        rPr = docOwner.createElement('w:rPr');
        run.insertBefore(rPr, run.firstChild);
      }
      const boldEl = docOwner.createElement('w:b');
      rPr.appendChild(boldEl);
    }
    let t = run.getElementsByTagName('w:t')[0];
    if (!t) {
      t = docOwner.createElement('w:t');
      run.appendChild(t);
    }
    t.textContent = text;
  }
}

function fillWeeklyReport(data, templateBuffer) {
  const zip = new PizZip(templateBuffer);
  const docXmlStr = zip.file("word/document.xml").asText();
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(docXmlStr, "application/xml");
  
  const startDateStr = data.startDate;
  const endDateStr = data.endDate;
  const candidates = data.candidates || [];
  const officeNeeds = data.officeManualNeeds || {};
  const projectNeeds = data.projectManualNeeds || {};
  
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);
  
  // Filter hired candidates
  const hiredCandidates = [];
  for (const c of candidates) {
    const status = String(c.status || "").toLowerCase();
    const v2Result = String(c.v2_result || "").toLowerCase();
    const probRes = String(c.probation_result || "").toLowerCase();
    const onboardDateStr = c.onboard_date;
    
    const isHired = (status === "hired" || status === "offer" || 
                     v2Result === "đạt" || v2Result === "pass" || 
                     probRes === "x" || probRes === "đạt" || 
                     onboardDateStr != null);
                     
    if (!isHired) continue;
    
    const cDateStr = onboardDateStr || c.v2_interview_date || c.created_at || c.v1_date;
    const cDate = parseDate(cDateStr);
    
    if (cDate) {
      if (startDate && cDate < startDate) continue;
      if (endDate && cDate > endDate) continue;
    }
    
    hiredCandidates.push(c);
  }
  
  // Format dates
  let formattedStart = "";
  let formattedEnd = "";
  if (startDate) {
    formattedStart = `${String(startDate.getDate()).padStart(2, '0')}/${String(startDate.getMonth() + 1).padStart(2, '0')}`;
  }
  if (endDate) {
    formattedEnd = `${String(endDate.getDate()).padStart(2, '0')}/${String(endDate.getMonth() + 1).padStart(2, '0')}/${endDate.getFullYear()}`;
  }
  
  // 1. Modify Title Paragraph
  const ps = doc.getElementsByTagName('w:p');
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const text = p.textContent || "";
    if (text.includes("BÁO CÁO TUYỂN DỤNG") || text.includes("BÁO CÁO TUYỂN DỤNG THÁNG")) {
      const runs = p.getElementsByTagName('w:r');
      let titleUpdated = false;
      for (let j = 0; j < runs.length; j++) {
        const run = runs[j];
        const ts = run.getElementsByTagName('w:t');
        for (let k = 0; k < ts.length; k++) {
          const t = ts[k];
          if (t.textContent.includes("BÁO CÁO TUYỂN DỤNG") || t.textContent.includes("BÁO CÁO TUYỂN DỤNG THÁNG")) {
            const docOwner = p.ownerDocument;
            const fragment = docOwner.createDocumentFragment();
            
            const t1 = docOwner.createElement('w:t');
            t1.textContent = "BÁO CÁO TUYỂN DỤNG TUẦN";
            fragment.appendChild(t1);
            
            const br = docOwner.createElement('w:br');
            fragment.appendChild(br);
            
            const t2 = docOwner.createElement('w:t');
            t2.textContent = `(Từ ngày ${formattedStart} đến ngày ${formattedEnd})`;
            fragment.appendChild(t2);
            
            t.parentNode.replaceChild(fragment, t);
            titleUpdated = true;
            break;
          }
        }
        if (titleUpdated) break;
      }
    }
  }
  
  // 2. Modify Bottom Date
  const reportDate = endDate || new Date();
  const dayStr = String(reportDate.getDate()).padStart(2, '0');
  const monthStr = String(reportDate.getMonth() + 1).padStart(2, '0');
  const yearStr = String(reportDate.getFullYear());
  
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const text = p.textContent || "";
    if (text.toLowerCase().includes("ngày") && text.toLowerCase().includes("tháng") && text.toLowerCase().includes("năm") && text.length < 50) {
      const docOwner = p.ownerDocument;
      let pPr = null;
      const pPrs = p.getElementsByTagName('w:pPr');
      if (pPrs.length > 0) {
        pPr = pPrs[0];
      }
      
      while (p.firstChild) {
        p.removeChild(p.firstChild);
      }
      
      if (pPr) {
        p.appendChild(pPr);
      } else {
        const newPPr = docOwner.createElement('w:pPr');
        const jc = docOwner.createElement('w:jc');
        jc.setAttribute('w:val', 'right');
        newPPr.appendChild(jc);
        p.appendChild(newPPr);
      }
      
      const run = docOwner.createElement('w:r');
      const rPr = docOwner.createElement('w:rPr');
      rPr.appendChild(docOwner.createElement('w:i'));
      run.appendChild(rPr);
      
      const t = docOwner.createElement('w:t');
      t.textContent = `Ngày ${dayStr} tháng ${monthStr} năm ${yearStr}`;
      run.appendChild(t);
      
      p.appendChild(run);
      break;
    }
  }
  
  // 3. Edit Table 0
  const tables = doc.getElementsByTagName('w:tbl');
  if (tables.length > 0) {
    const table = tables[0];
    const rows = [];
    for (let i = 0; i < table.childNodes.length; i++) {
      const node = table.childNodes[i];
      if (node.nodeName === 'w:tr') {
        rows.push(node);
      }
    }
    
    const projectSlots = [
      { header_idx: 2, data_indices: [3, 4] },
      { header_idx: 5, data_indices: [6] },
      { header_idx: 7, data_indices: [8] },
      { header_idx: 9, data_indices: [10, 11] },
      { header_idx: 12, data_indices: [13, 14] }
    ];
    
    const officeSlots = [
      { header_idx: 16, data_indices: [17, 18] },
      { header_idx: 19, data_indices: [20, 21] },
      { header_idx: 22, data_indices: [23, 24] },
      { header_idx: 25, data_indices: [26] },
      { header_idx: 27, data_indices: [28] },
      { header_idx: 29, data_indices: [30, 31] }
    ];
    
    const activeProjects = Object.entries(projectNeeds);
    const activeOffice = Object.entries(officeNeeds);
    const rowsToDelete = [];
    
    function generateRowsForDept(deptName, totalDemand) {
      const deptCands = candidates.filter(c => normalizeDept(c.department) === normalizeDept(deptName));
      const hiredInRange = hiredCandidates.filter(c => normalizeDept(c.department) === normalizeDept(deptName));
      
      const resRows = [];
      if (hiredInRange.length > 0) {
        const roleGroups = {};
        for (const c of hiredInRange) {
          const rName = c.role || "Nhân sự";
          if (!roleGroups[rName]) {
            roleGroups[rName] = [];
          }
          roleGroups[rName].push(c);
        }
        
        let hiredTotal = 0;
        for (const [roleName, cands] of Object.entries(roleGroups)) {
          const hired = cands.length;
          hiredTotal += hired;
          const demand = hired;
          
          const notesParts = [];
          for (const c of cands) {
            const cName = c.name || "";
            const oDateStr = c.onboard_date;
            if (oDateStr) {
              const oDate = parseDate(oDateStr);
              if (oDate) {
                notesParts.push(`${cName} ${oDate.getDate()}/${oDate.getMonth() + 1}`);
              } else {
                notesParts.push(`${cName} ${oDateStr}`);
              }
            } else {
              notesParts.push(cName);
            }
          }
          
          resRows.push({
            role: roleName,
            demand: demand,
            hired: hired,
            remaining: 0,
            progress: "Hoàn thành",
            notes: notesParts.join(", ")
          });
        }
        
        if (hiredTotal < totalDemand) {
          const remainingDemand = totalDemand - hiredTotal;
          const otherRoles = [...new Set(deptCands.map(c => c.role).filter(Boolean))];
          const activeHiredRoles = Object.keys(roleGroups);
          const unusedRoles = otherRoles.filter(r => !activeHiredRoles.includes(r));
          const fallbackRole = unusedRoles.length > 0 ? unusedRoles[0] : (otherRoles.length > 0 ? otherRoles[0] : "");
          
          resRows.push({
            role: fallbackRole,
            demand: remainingDemand,
            hired: 0,
            remaining: remainingDemand,
            progress: "Chưa hoàn thành",
            notes: ""
          });
        }
      } else {
        const deptRoles = [...new Set(deptCands.map(c => c.role).filter(Boolean))];
        const primaryRole = deptRoles.length > 0 ? deptRoles[0] : "";
        
        resRows.push({
          role: primaryRole,
          demand: totalDemand,
          hired: 0,
          remaining: totalDemand,
          progress: totalDemand > 0 ? "Chưa hoàn thành" : "",
          notes: ""
        });
      }
      return resRows;
    }
    
    // Process project slots
    for (let i = 0; i < projectSlots.length; i++) {
      const slot = projectSlots[i];
      if (i < activeProjects.length) {
        const [name, demand] = activeProjects[i];
        const headerRow = rows[slot.header_idx];
        const cells = headerRow.getElementsByTagName('w:tc');
        setCellTextPreserve(cells[0], name.toUpperCase(), true);
        
        const deptRows = generateRowsForDept(name, demand);
        for (let j = 0; j < slot.data_indices.length; j++) {
          const dataRowIdx = slot.data_indices[j];
          if (j < deptRows.length) {
            const rData = deptRows[j];
            const dRow = rows[dataRowIdx];
            const dCells = dRow.getElementsByTagName('w:tc');
            
            setCellTextPreserve(dCells[0], "");
            setCellTextPreserve(dCells[1], rData.role);
            setCellTextPreserve(dCells[2], String(rData.demand));
            setCellTextPreserve(dCells[3], rData.hired > 0 ? String(rData.hired) : "-");
            
            if (rData.demand > 0) {
              setCellTextPreserve(dCells[4], rData.remaining > 0 ? String(rData.remaining) : "0");
              setCellTextPreserve(dCells[5], rData.progress);
            } else {
              setCellTextPreserve(dCells[4], "-");
              setCellTextPreserve(dCells[5], "");
            }
            setCellTextPreserve(dCells[6], rData.notes);
          } else {
            rowsToDelete.push(dataRowIdx);
          }
        }
      } else {
        rowsToDelete.push(slot.header_idx);
        rowsToDelete.push(...slot.data_indices);
      }
    }
    
    // Process office slots
    for (let i = 0; i < officeSlots.length; i++) {
      const slot = officeSlots[i];
      if (i < activeOffice.length) {
        const [name, demand] = activeOffice[i];
        const headerRow = rows[slot.header_idx];
        const cells = headerRow.getElementsByTagName('w:tc');
        
        let displayName = name;
        if (name === "HCNS") displayName = "PHÒNG HÀNH CHÍNH - NHÂN SỰ";
        else if (name === "Phòng QLDA") displayName = "PHÒNG QUẢN LÝ DỰ ÁN";
        else if (name === "Kế toán") displayName = "PHÒNG KẾ TOÁN";
        
        setCellTextPreserve(cells[0], displayName.toUpperCase(), true);
        
        const deptRows = generateRowsForDept(name, demand);
        for (let j = 0; j < slot.data_indices.length; j++) {
          const dataRowIdx = slot.data_indices[j];
          if (j < deptRows.length) {
            const rData = deptRows[j];
            const dRow = rows[dataRowIdx];
            const dCells = dRow.getElementsByTagName('w:tc');
            
            setCellTextPreserve(dCells[0], "");
            setCellTextPreserve(dCells[1], rData.role);
            setCellTextPreserve(dCells[2], String(rData.demand));
            setCellTextPreserve(dCells[3], rData.hired > 0 ? String(rData.hired) : "-");
            
            if (rData.demand > 0) {
              setCellTextPreserve(dCells[4], rData.remaining > 0 ? String(rData.remaining) : "0");
              setCellTextPreserve(dCells[5], rData.progress);
            } else {
              setCellTextPreserve(dCells[4], "-");
              setCellTextPreserve(dCells[5], "");
            }
            setCellTextPreserve(dCells[6], rData.notes);
          } else {
            rowsToDelete.push(dataRowIdx);
          }
        }
      } else {
        rowsToDelete.push(slot.header_idx);
        rowsToDelete.push(...slot.data_indices);
      }
    }
    
    // Delete rows in descending order
    const uniqueRowsToDelete = [...new Set(rowsToDelete)].sort((a, b) => b - a);
    for (const idx of uniqueRowsToDelete) {
      const rNode = rows[idx];
      if (rNode && rNode.parentNode) {
        rNode.parentNode.removeChild(rNode);
      }
    }
  }
  
  // Serialize back to XML
  const serializer = new XMLSerializer();
  const newDocXmlStr = serializer.serializeToString(doc);
  
  zip.file("word/document.xml", newDocXmlStr);
  return zip.generate({ type: "nodebuffer" });
}

module.exports = { fillWeeklyReport };
