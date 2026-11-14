let scene, camera, renderer, controls, object3D;
let capMesh = null;
let isCapVisible = false;
let currentCapColor = '#e74c3c';
let annotationPoints = [];
let drawnLines = []; 
let activeModel = '';

function toggleLeftPanel() {
    const panel = document.getElementById('left-panel');
    const btn = document.getElementById('btn-toggle-info');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        btn.innerText = '👁 Hide Info';
    } else {
        panel.style.display = 'none';
        btn.innerText = '👁 Show Info';
    }
}

function toggleRightPanel() {
    const panel = document.getElementById('right-panel');
    const btn = document.getElementById('btn-toggle-tools');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        btn.innerText = '👁 Hide Tools';
    } else {
        panel.style.display = 'none';
        btn.innerText = '👁 Show Tools';
    }
}

// =========================================================================
// MESIN PEMINDAI GEOMETRI (KAMAR INDEPENDEN UTUH)
// =========================================================================
function detectHoleAndHandle(geometry, matrixWorld, box, size, filename) {
    const fileLower = filename.toLowerCase();

    if (fileLower === 'jer_1_liter_lebar.stl') {
        const posAttribute = geometry.attributes.position;
        const v = new THREE.Vector3();
        let leftVertices = [], rightVertices = [], centerVertices = [];
        const thresholdX = size.x * 0.15; 
        const topThreshold = box.max.y - (size.y * 0.3); 
        for(let i=0; i<posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i).applyMatrix4(matrixWorld);
            if(v.y > topThreshold) {
                if(v.x < -thresholdX) leftVertices.push(v.clone());
                else if(v.x > thresholdX) rightVertices.push(v.clone());
                else centerVertices.push(v.clone());
            }
        }
        function analyzeCluster(verts) {
            if(verts.length === 0) return null;
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = -Infinity;
            let sumX = 0, sumZ = 0, countTop = 0;
            verts.forEach(vert => {
                if(vert.y > maxY) maxY = vert.y;
                if(vert.x < minX) minX = vert.x;
                if(vert.x > maxX) maxX = vert.x;
                if(vert.z < minZ) minZ = vert.z;
                if(vert.z > maxZ) maxZ = vert.z;
            });
            verts.forEach(vert => {
                if(vert.y >= maxY - 2.0) { sumX += vert.x; sumZ += vert.z; countTop++; }
            });
            let dx = Math.max(0.1, maxX - minX);
            let dz = Math.max(0.1, maxZ - minZ);
            let circularRatio = Math.min(dx, dz) / Math.max(dx, dz); 
            return { y: maxY, x: countTop > 0 ? sumX/countTop : (minX+maxX)/2, z: countTop > 0 ? sumZ/countTop : (minZ+maxZ)/2, ratio: circularRatio, width: dx };
        }
        let candidates = [];
        let l = analyzeCluster(leftVertices); if(l && l.width > 5) candidates.push(l);
        let r = analyzeCluster(rightVertices); if(r && r.width > 5) candidates.push(r);
        let c = analyzeCluster(centerVertices); if(c && c.width > 5) candidates.push(c);

        if(candidates.length === 0) return { drat: new THREE.Vector3(0, box.max.y, 0), handle: new THREE.Vector3(0, box.max.y, 0) };
        if(candidates.length === 1) return { drat: new THREE.Vector3(candidates[0].x, candidates[0].y, candidates[0].z), handle: new THREE.Vector3(candidates[0].x, candidates[0].y, candidates[0].z) };

        candidates.sort((a, b) => Math.abs(1 - a.ratio) - Math.abs(1 - b.ratio));
        let dratCand = candidates[0];
        let remaining = candidates.filter(cand => cand !== dratCand);
        remaining.sort((a, b) => b.y - a.y); 
        let handleCand = remaining[0];
        return { drat: new THREE.Vector3(dratCand.x, dratCand.y, dratCand.z), handle: new THREE.Vector3(handleCand.x, handleCand.y, handleCand.z) };
    }

    if (fileLower === 'jerigen_05_liter.stl') {
        const posAttribute = geometry.attributes.position;
        const v = new THREE.Vector3();
        let leftMaxY = -Infinity, rightMaxY = -Infinity;
        for(let i=0; i<posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i).applyMatrix4(matrixWorld);
            if (v.y > box.max.y - (size.y * 0.6)) { 
                if (v.x < -2) { if (v.y > leftMaxY) leftMaxY = v.y; } 
                else if (v.x > 2) { if (v.y > rightMaxY) rightMaxY = v.y; }
            }
        }
        let leftVerts = [], rightVerts = [];
        for(let i=0; i<posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i).applyMatrix4(matrixWorld);
            if (v.x < -2 && v.y >= leftMaxY - 5.0) leftVerts.push(v.clone());
            if (v.x > 2 && v.y >= rightMaxY - 5.0) rightVerts.push(v.clone());
        }
        function analyzeSize(verts, maxY) {
            if(verts.length === 0) return { area: 0, center: new THREE.Vector3(0, maxY, 0) };
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            let sumX = 0, sumZ = 0, count = 0;
            verts.forEach(vert => {
                if(vert.x < minX) minX = vert.x;
                if(vert.x > maxX) maxX = vert.x;
                if(vert.z < minZ) minZ = vert.z;
                if(vert.z > maxZ) maxZ = vert.z;
                if(vert.y >= maxY - 1.5) { sumX += vert.x; sumZ += vert.z; count++; }
            });
            let dx = Math.max(0.1, maxX - minX); let dz = Math.max(0.1, maxZ - minZ);
            return { area: dx * dz, center: new THREE.Vector3(count > 0 ? sumX/count : (minX+maxX)/2, maxY, count > 0 ? sumZ/count : (minZ+maxZ)/2) };
        }
        let L = analyzeSize(leftVerts, leftMaxY); let R = analyzeSize(rightVerts, rightMaxY);
        if (L.area > R.area) { return { drat: L.center, handle: R.center }; } 
        else { return { drat: R.center, handle: L.center }; }
    }

    if (fileLower === 'jerigen5_literasia.stl' || fileLower === 'jerigen5 literasia.stl' || fileLower === 'jerigen.stl') {
        const posAttribute = geometry.attributes.position;
        const v = new THREE.Vector3();
        let leftMaxY = -Infinity, rightMaxY = -Infinity;
        for(let i=0; i<posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i).applyMatrix4(matrixWorld);
            if (v.y > box.max.y - (size.y * 0.4)) { 
                if (v.x < -10) { if (v.y > leftMaxY) leftMaxY = v.y; } 
                else if (v.x > 10) { if (v.y > rightMaxY) rightMaxY = v.y; }
            }
        }
        let leftVerts = [], rightVerts = [];
        for(let i=0; i<posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i).applyMatrix4(matrixWorld);
            if (v.x < -10 && v.y >= leftMaxY - 5.0) leftVerts.push(v.clone());
            if (v.x > 10 && v.y >= rightMaxY - 5.0) rightVerts.push(v.clone());
        }
        function analyzeCircularity5L(verts, maxY) {
            if(verts.length === 0) return { ratio: 0, center: new THREE.Vector3(0, maxY, 0) };
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            let sumX = 0, sumZ = 0, count = 0;
            verts.forEach(vert => {
                if(vert.x < minX) minX = vert.x;
                if(vert.x > maxX) maxX = vert.x;
                if(vert.z < minZ) minZ = vert.z;
                if(vert.z > maxZ) maxZ = vert.z;
                if(vert.y >= maxY - 2.0) { sumX += vert.x; sumZ += vert.z; count++; }
            });
            let dx = Math.max(0.1, maxX - minX); let dz = Math.max(0.1, maxZ - minZ);
            let ratio = Math.min(dx, dz) / Math.max(dx, dz); 
            return { ratio: ratio, center: new THREE.Vector3(count > 0 ? sumX/count : (minX+maxX)/2, maxY, count > 0 ? sumZ/count : (minZ+maxZ)/2) };
        }
        let L = analyzeCircularity5L(leftVerts, leftMaxY); let R = analyzeCircularity5L(rightVerts, rightMaxY);
        if (Math.abs(1 - L.ratio) < Math.abs(1 - R.ratio)) { return { drat: L.center, handle: R.center }; } 
        else { return { drat: R.center, handle: L.center }; }
    }

    if (fileLower === 'botol_1_liter_panjang.stl' || fileLower === 'botol_pupuk_1_liter.stl' || fileLower === 'botol_m_1000_mk.stl' || fileLower === 'botol_300_cc.stl' || fileLower === 'botol_pet_sambal_jays.stl' || fileLower === 'pet_250cc_barokah.stl' || fileLower === 'botol_50_cc.stl' || fileLower === 'botol_10_cc.stl' || fileLower === 'botol_m250.stl' || fileLower === 'botol_hdpe_100_cc_nok.stl' || fileLower === 'botol_60_cc_vicaris.stl' || fileLower === 'botol_m500.stl' || fileLower === 'botol_hdpe_m1000_petroka.stl') {
        const posAttribute = geometry.attributes.position;
        const v = new THREE.Vector3();
        let maxY = -Infinity;
        for(let i=0; i<posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i).applyMatrix4(matrixWorld);
            if(v.y > maxY) maxY = v.y;
        }
        let sumX = 0, sumZ = 0, count = 0;
        for(let i=0; i<posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i).applyMatrix4(matrixWorld);
            if(v.y >= maxY - 2.0) { sumX += v.x; sumZ += v.z; count++; }
        }
        let centerPos = new THREE.Vector3(count > 0 ? sumX/count : 0, maxY, count > 0 ? sumZ/count : 0);
        return { drat: centerPos, handle: centerPos };
    }

    if (fileLower.includes('sos')) {
        const posAttribute = geometry.attributes.position;
        const v = new THREE.Vector3();
        let pts = [];
        const yThresh = box.max.y - (size.y * 0.40); 
        for(let i=0; i<posAttribute.count; i+=3) { 
            v.fromBufferAttribute(posAttribute, i).applyMatrix4(matrixWorld);
            if (v.y > yThresh) pts.push(v.clone());
        }
        pts.sort((a, b) => b.y - a.y);
        let bestDrat = null;
        let blockedRegions = [];
        for (let i = 0; i < pts.length; i++) {
            let p = pts[i];
            let isBlocked = false;
            for (let r of blockedRegions) {
                if (Math.abs(p.x - r.x) < 40 && Math.abs(p.z - r.z) < 40) { isBlocked = true; break; }
            }
            if (isBlocked) continue; 
            let cluster = pts.filter(pt => Math.abs(pt.x - p.x) < 40 && Math.abs(pt.z - p.z) < 40 && pt.y >= p.y - 15.0);
            if (cluster.length < 10) continue; 
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            cluster.forEach(pt => {
                if(pt.x < minX) minX = pt.x; if(pt.x > maxX) maxX = pt.x;
                if(pt.z < minZ) minZ = pt.z; if(pt.z > maxZ) maxZ = pt.z;
            });
            let centerX = (minX + maxX) / 2; let centerZ = (minZ + maxZ) / 2;
            blockedRegions.push({x: centerX, z: centerZ});
            let ratio = Math.min((maxX-minX), (maxZ-minZ)) / Math.max((maxX-minX), (maxZ-minZ)); 
            if (ratio > 0.55 && (maxX-minX) > 20 && (maxZ-minZ) > 20) { bestDrat = new THREE.Vector3(centerX, p.y, centerZ); break; }
        }
        if (!bestDrat && blockedRegions.length > 0) bestDrat = new THREE.Vector3(blockedRegions[0].x, box.max.y, blockedRegions[0].z);
        return { drat: bestDrat || new THREE.Vector3(0, box.max.y, 0), handle: new THREE.Vector3(0, box.max.y, 0) };
    }

    if (fileLower === 'jerigen_5_liter_jr.stl') {
        const posAttribute = geometry.attributes.position;
        const v = new THREE.Vector3();
        let leftMaxY = -Infinity, rightMaxY = -Infinity;
        for(let i=0; i<posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i).applyMatrix4(matrixWorld);
            if (v.y > box.max.y - (size.y * 0.4)) { 
                if (v.x < -10) { if (v.y > leftMaxY) leftMaxY = v.y; } 
                else if (v.x > 10) { if (v.y > rightMaxY) rightMaxY = v.y; }
            }
        }
        let leftVerts = [], rightVerts = [];
        for(let i=0; i<posAttribute.count; i++) {
            v.fromBufferAttribute(posAttribute, i).applyMatrix4(matrixWorld);
            if (v.x < -10 && v.y >= leftMaxY - 5.0) leftVerts.push(v.clone());
            if (v.x > 10 && v.y >= rightMaxY - 5.0) rightVerts.push(v.clone());
        }
        function analyzeCircularityJR(verts, maxY) {
            if(verts.length === 0) return { ratio: 0, center: new THREE.Vector3(0, maxY, 0) };
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, sumX = 0, sumZ = 0, count = 0;
            verts.forEach(vert => {
                if(vert.x < minX) minX = vert.x; if(vert.x > maxX) maxX = vert.x;
                if(vert.z < minZ) minZ = vert.z; if(vert.z > maxZ) maxZ = vert.z;
                if(vert.y >= maxY - 2.0) { sumX += vert.x; sumZ += vert.z; count++; }
            });
            let dx = Math.max(0.1, maxX - minX); let dz = Math.max(0.1, maxZ - minZ);
            return { ratio: Math.min(dx, dz) / Math.max(dx, dz), center: new THREE.Vector3(count > 0 ? sumX/count : (minX+maxX)/2, maxY, count > 0 ? sumZ/count : (minZ+maxZ)/2) };
        }
        let L = analyzeCircularityJR(leftVerts, leftMaxY); let R = analyzeCircularityJR(rightVerts, rightMaxY);
        if (Math.abs(1 - L.ratio) < Math.abs(1 - R.ratio)) { return { drat: L.center, handle: R.center }; } else { return { drat: R.center, handle: L.center }; }
    }

    // =========================================================================
    // KUMPULAN KOORDINAT EMAS MUTLAK (FACTORY DEFAULT / HARDCODED) 
    // =========================================================================
    if (fileLower.includes('jer_20') || fileLower.includes('20_liter')) return { drat: new THREE.Vector3(103.00, box.max.y, 3.00), handle: new THREE.Vector3(103.00, box.max.y, 3.00) };
    if (fileLower.includes('30_liter_chem')) return { drat: new THREE.Vector3(-105.00, 234.69, -3.00), handle: new THREE.Vector3(-105.00, 234.69, -3.00) };
    if (fileLower === 'botol_200_cc.stl') return { drat: new THREE.Vector3(0.35, 70.75, -0.24), handle: new THREE.Vector3(0.35, 70.75, -0.24) };
    if (fileLower === 'botol_100_cc.stl') return { drat: new THREE.Vector3(-0.33, 58.75, 0.02), handle: new THREE.Vector3(-0.33, 58.75, 0.02) };
    if (fileLower === 'jerigen_5_liter_lebar_mk.stl') return { drat: new THREE.Vector3(84.00, 127.25, 2.00), handle: new THREE.Vector3(84.00, 127.25, 2.00) };
    if (fileLower === 'botol_kotak_1_kg.stl') return { drat: new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2), handle: new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2) };
    if (fileLower.includes('pupuk_pet_50_ml')) return { drat: new THREE.Vector3(0.00, 29.50, 0.00), handle: new THREE.Vector3(0.00, 29.50, 0.00) };
    if (fileLower === 'botol_m_100_cc.stl') return { drat: new THREE.Vector3(0.00, box.max.y, 0.00), handle: new THREE.Vector3(0.00, box.max.y, 0.00) };

    // -------------------------------------------------------------------------
    // KAMAR 27: BOTOL LAINNYA (GENERIC CADANGAN)
    // -------------------------------------------------------------------------
    const posAttribute = geometry.attributes.position;
    const v = new THREE.Vector3();
    let leftVertices = [], rightVertices = [], centerVertices = [];
    const thresholdX = size.x * 0.15; const topThreshold = box.max.y - (size.y * 0.3); 
    for(let i=0; i<posAttribute.count; i++) {
        v.fromBufferAttribute(posAttribute, i).applyMatrix4(matrixWorld);
        if(v.y > topThreshold) {
            if(v.x < -thresholdX) leftVertices.push(v.clone());
            else if(v.x > thresholdX) rightVertices.push(v.clone());
            else centerVertices.push(v.clone());
        }
    }
    function analyzeClusterGeneral(verts) {
        if(verts.length === 0) return null;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = -Infinity;
        let sumX = 0, sumZ = 0, countTop = 0;
        verts.forEach(vert => {
            if(vert.y > maxY) maxY = vert.y;
            if(vert.x < minX) minX = vert.x; if(vert.x > maxX) maxX = vert.x;
            if(vert.z < minZ) minZ = vert.z; if(vert.z > maxZ) maxZ = vert.z;
        });
        verts.forEach(vert => { if(vert.y >= maxY - 2.0) { sumX += vert.x; sumZ += vert.z; countTop++; } });
        let dx = Math.max(0.1, maxX - minX); let dz = Math.max(0.1, maxZ - minZ);
        return { y: maxY, x: countTop > 0 ? sumX/countTop : (minX+maxX)/2, z: countTop > 0 ? sumZ/countTop : (minZ+maxZ)/2, ratio: Math.min(dx, dz) / Math.max(dx, dz), width: dx };
    }
    let candidates = [];
    let l = analyzeClusterGeneral(leftVertices); if(l && l.width > 5) candidates.push(l);
    let r = analyzeClusterGeneral(rightVertices); if(r && r.width > 5) candidates.push(r);
    let c = analyzeClusterGeneral(centerVertices); if(c && c.width > 5) candidates.push(c);
    if(candidates.length === 0) return { drat: new THREE.Vector3(0, box.max.y, 0), handle: new THREE.Vector3(0, box.max.y, 0) };
    if(candidates.length === 1) return { drat: new THREE.Vector3(candidates[0].x, candidates[0].y, candidates[0].z), handle: new THREE.Vector3(candidates[0].x, candidates[0].y, candidates[0].z) };
    candidates.sort((a, b) => Math.abs(1 - a.ratio) - Math.abs(1 - b.ratio));
    let dratCand = candidates[0]; let remaining = candidates.filter(cand => cand !== dratCand); remaining.sort((a, b) => b.y - a.y); let handleCand = remaining[0]; 
    return { drat: new THREE.Vector3(dratCand.x, dratCand.y, dratCand.z), handle: new THREE.Vector3(handleCand.x, handleCand.y, handleCand.z) };
}

// Database Ukuran Tutup
function getCapSettings(filename, size) {
    let settings = { radius: size.x * 0.15, height: Math.max(14, size.y * 0.06), offsetY: 1.5 };
    const fileLower = filename.toLowerCase();

    if (fileLower === 'jerigen5_literasia.stl' || fileLower === 'jerigen5 literasia.stl' || fileLower === 'jerigen.stl') {
        settings.radius = 26.0; settings.height = 22; settings.offsetY = 1.5;
    } else if (fileLower === 'botol_pupuk_1_liter.stl') {
        settings.radius = 26.0; settings.height = 30; settings.offsetY = 2.5;
    } else if (fileLower === 'botol_m_1000_mk.stl') {
        settings.radius = 19.5; settings.height = 22; settings.offsetY = 1.0;
    } else if (fileLower === 'botol_300_cc.stl') {
        settings.radius = 13.5; settings.height = 14; settings.offsetY = 1.0;
    } else if (fileLower === 'botol_200_cc.stl') {
        settings.radius = 12.0; settings.height = 14.0; settings.offsetY = 1.0; 
    } else if (fileLower === 'botol_pet_sambal_jays.stl') {
        settings.radius = 28.2; settings.height = 20; settings.offsetY = 3.5;
    } else if (fileLower === 'botol_100_cc.stl') {
        settings.radius = 12.1; settings.height = 14.5; settings.offsetY = 1.0;
    } else if (fileLower === 'pet_250cc_barokah.stl') {
        settings.radius = 17.2; settings.height = 16; settings.offsetY = 1.5;
    } else if (fileLower === 'botol_50_cc.stl') {
        settings.radius = 12.4; settings.height = 13.5; settings.offsetY = 1.5;
    } else if (fileLower === 'botol_10_cc.stl') {
        settings.radius = 8.8; settings.height = 12.0; settings.offsetY = 1.0;
    } else if (fileLower === 'botol_m250.stl') {
        settings.radius = 17.0; settings.height = 15.0; settings.offsetY = 1.0;
    } else if (fileLower === 'botol_hdpe_100_cc_nok.stl') {
        settings.radius = 13.4; settings.height = 14.5; settings.offsetY = 1.0;
    } else if (fileLower === 'botol_60_cc_vicaris.stl') {
        settings.radius = 12.7; settings.height = 14.0; settings.offsetY = 1.0;
    } else if (fileLower.includes('botol_pupuk_pet_50_ml')) {
        settings.radius = 18.5; settings.height = 14.0; settings.offsetY = 1.5;
    } else if (fileLower === 'botol_m500.stl') {
        settings.radius = 17.0; settings.height = 18.0; settings.offsetY = 1.0;
    } else if (fileLower === 'botol_m_100_cc.stl') {
        settings.radius = 16.0; settings.height = 14.0; settings.offsetY = 1.0;
    } else if (fileLower === 'botol_kotak_1_kg.stl') {
        settings.radius = 43.5; settings.height = 35.0; settings.offsetY = 1.0;
    } else if (fileLower === 'jerigen_5_liter_jr.stl' || fileLower === 'jerigen_5_liter_lebar_mk.stl') {
        settings.radius = 26.0; settings.height = 22.0; settings.offsetY = 1.5;
    } else if (fileLower === 'botol_hdpe_m1000_petroka.stl') {
        settings.radius = 19.5; settings.height = 20.0; settings.offsetY = 1.5;
    } else if (fileLower.includes('sos')) {
        settings.radius = 25.0; settings.height = 30.0; settings.offsetY = 1.0; 
    } else if (fileLower.includes('jer_20') || fileLower.includes('20_liter')) {
        settings.radius = 37.6; settings.height = 35.0; settings.offsetY = 1.0; 
    } else if (fileLower.includes('30_liter_chem')) {
        settings.radius = 42.0; settings.height = 35.0; settings.offsetY = 17.5; 
    } else if (fileLower === 'waterbottle.stl') {
        settings.radius = 15.0; settings.height = 18;
    } else if (fileLower === 'jer_1_liter_lebar.stl') {
        settings.radius = 18.0; settings.height = 18; settings.offsetY = 1.5;
    } else if (fileLower === 'jerigen_05_liter.stl') {
        settings.radius = 19.5; settings.height = 22; settings.offsetY = 1.5; 
    } else if (fileLower === 'botol_1_liter_panjang.stl') {
        settings.radius = 19.5; settings.height = 24; settings.offsetY = 0.5;
    } else if (fileLower === 'jerigen_30_liter_chem.stl') {
        settings.radius = 18.0; settings.height = 20;
    }
    return settings;
}

// =========================================================================
// UI MODERN MINIMALIS (GAMEPAD / CONTROLLER)
// =========================================================================

// Menyuntikkan style CSS khusus untuk animasi tombol Gamepad agar terlihat mewah
if (!document.getElementById('tuner-styles')) {
    const style = document.createElement('style');
    style.id = 'tuner-styles';
    style.innerHTML = `
        .tuner-btn {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
            border-radius: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .tuner-btn:hover { background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.25); }
        .tuner-btn:active { transform: scale(0.92); background: rgba(255, 255, 255, 0.25); }
        
        .tuner-action-btn {
            padding: 10px 16px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 12px;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
            font-family: system-ui, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .btn-reset { background: rgba(255,255,255,0.1); color: #e2e8f0; }
        .btn-reset:hover { background: rgba(255,255,255,0.2); color: #fff; }
        .btn-save { background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 4px 12px rgba(16,185,129,0.3); }
        .btn-save:hover { background: linear-gradient(135deg, #34d399, #10b981); box-shadow: 0 6px 16px rgba(16,185,129,0.4); transform: translateY(-1px); }
        .btn-save:active { transform: translateY(1px); box-shadow: none; }
    `;
    document.head.appendChild(style);
}

function toggleUserManualTuner() {
    let div = document.getElementById('user-manual-tuner-ui');
    
    if(!div) {
        div = document.createElement('div');
        div.id = 'user-manual-tuner-ui';
        div.style.position = 'absolute';
        div.style.bottom = '20px'; 
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        // Material Panel ala Apple
        div.style.background = 'rgba(15, 23, 42, 0.75)';
        div.style.backdropFilter = 'blur(16px)';
        div.style.webkitBackdropFilter = 'blur(16px)';
        div.style.border = '1px solid rgba(255,255,255,0.1)';
        div.style.padding = '20px';
        div.style.borderRadius = '24px';
        div.style.boxShadow = '0 25px 50px -12px rgba(0,0,0,0.5)';
        div.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        div.style.zIndex = '9999';
        div.style.width = 'max-content';
        
        // Ikon SVG Minimalis
        const iconUp = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
        const iconDown = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>`;
        const iconLeft = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;
        const iconRight = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
        const iconSave = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
        const iconReset = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>`;

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <span style="color:#f8fafc; font-size:14px; font-weight:700; letter-spacing:1px; opacity:0.9;">TUNE POSITION</span>
                <button onclick="document.getElementById('user-manual-tuner-ui').style.display='none'" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:16px; padding:0; height:20px; transition:color 0.2s;">✕</button>
            </div>
            
            <div style="display:flex; align-items:center; justify-content:center; gap:15px;">
                <!-- D-Pad Kiri (X dan Z) -->
                <div style="display:grid; grid-template-columns: repeat(3, 44px); gap:6px;">
                    <div></div>
                    <button class="tuner-btn" id="btn-user-up">${iconUp}</button>
                    <div></div>
                    <button class="tuner-btn" id="btn-user-left">${iconLeft}</button>
                    <div style="display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.2); font-size:11px; font-weight:800;">X/Z</div>
                    <button class="tuner-btn" id="btn-user-right">${iconRight}</button>
                    <div></div>
                    <button class="tuner-btn" id="btn-user-down">${iconDown}</button>
                    <div></div>
                </div>
                
                <div style="width:1px; height:90px; background:rgba(255,255,255,0.1); border-radius:1px;"></div>

                <!-- Tuas Kanan (Y Naik Turun) -->
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button class="tuner-btn" id="btn-user-y-up" style="width:46px; height:46px;">${iconUp}</button>
                    <div style="text-align:center; color:rgba(255,255,255,0.2); font-size:11px; font-weight:800; margin:2px 0;">Y</div>
                    <button class="tuner-btn" id="btn-user-y-down" style="width:46px; height:46px;">${iconDown}</button>
                </div>
            </div>
            
            <!-- Indikator Angka Bersih -->
            <div id="live-kordinat" style="background:rgba(0,0,0,0.3); border-radius:8px; padding:8px; margin-top:15px; text-align:center; color:#38bdf8; font-family:monospace; font-size:13px; font-weight:600; letter-spacing:1px; box-shadow:inset 0 2px 4px rgba(0,0,0,0.5);">
                X: 0.0   Y: 0.0   Z: 0.0
            </div>

            <!-- Tombol Aksi Bawah -->
            <div style="display:flex; gap:10px; margin-top:12px;">
                <button class="tuner-action-btn btn-reset" id="btn-user-reset" style="flex:1;">${iconReset} Reset</button>
                <button class="tuner-action-btn btn-save" id="btn-user-save" style="flex:1.5;">${iconSave} Save</button>
            </div>
        `;
        document.body.appendChild(div);

        const step = 0.5; // Tetap 0.5mm untuk presisi tinggi
        
        const updateCoords = () => {
            if(capMesh) {
                document.getElementById('live-kordinat').innerHTML = `X: ${capMesh.position.x.toFixed(1)}   Y: ${capMesh.position.y.toFixed(1)}   Z: ${capMesh.position.z.toFixed(1)}`;
            }
        };

        // Event Klik Mouse & Sentuh
        document.getElementById('btn-user-up').onclick = () => { if(capMesh){ capMesh.position.z -= step; updateCoords(); }};
        document.getElementById('btn-user-down').onclick = () => { if(capMesh){ capMesh.position.z += step; updateCoords(); }};
        document.getElementById('btn-user-left').onclick = () => { if(capMesh){ capMesh.position.x -= step; updateCoords(); }};
        document.getElementById('btn-user-right').onclick = () => { if(capMesh){ capMesh.position.x += step; updateCoords(); }};
        document.getElementById('btn-user-y-up').onclick = () => { if(capMesh){ capMesh.position.y += step; updateCoords(); }};
        document.getElementById('btn-user-y-down').onclick = () => { if(capMesh){ capMesh.position.y -= step; updateCoords(); }};
        
        // Simpan
        document.getElementById('btn-user-save').onclick = () => {
            if(capMesh && activeModel) {
                const pos = { x: capMesh.position.x, y: capMesh.position.y, z: capMesh.position.z };
                localStorage.setItem(`saved_cap_${activeModel}`, JSON.stringify(pos)); 
                alert(`Posisi Disimpan!\n(X: ${pos.x.toFixed(1)}, Y: ${pos.y.toFixed(1)}, Z: ${pos.z.toFixed(1)})`);
            }
        };

        // Reset
        document.getElementById('btn-user-reset').onclick = () => {
            if(activeModel) {
                localStorage.removeItem(`saved_cap_${activeModel}`); 
                alert('Posisi dikembalikan ke default sistem.');
                init3D(activeModel); 
            }
        };
    }
    
    // Logika buka/tutup
    if (div.style.display === 'none') {
        div.style.display = 'block';
        if (!isCapVisible) { document.getElementById('toggle-cap').click(); }
        if(capMesh) {
            document.getElementById('live-kordinat').innerHTML = `X: ${capMesh.position.x.toFixed(1)}   Y: ${capMesh.position.y.toFixed(1)}   Z: ${capMesh.position.z.toFixed(1)}`;
        }
    } else {
        div.style.display = 'none';
    }
}

// Tombol Pemicu di Menu Kanan
function injectManualButtonToUI() {
    const toolsPanel = document.getElementById('right-panel');
    if (toolsPanel && !document.getElementById('btn-show-manual-tuner')) {
        const btn = document.createElement('button');
        btn.id = 'btn-show-manual-tuner';
        btn.innerHTML = `<span style="margin-right:5px; font-size:14px;">🎛️</span> Tweak Position`;
        btn.style.marginTop = '15px';
        btn.style.width = '100%';
        btn.style.padding = '10px 12px';
        btn.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '8px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = '600';
        btn.style.fontSize = '12px';
        btn.style.fontFamily = 'system-ui, sans-serif';
        btn.style.boxShadow = '0 4px 12px rgba(59,130,246,0.3)';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        
        toolsPanel.appendChild(btn);
        btn.onclick = toggleUserManualTuner;
    }
}

function openDashboard(filename, title) {
    document.getElementById('page-landing').style.display = 'none';
    document.getElementById('page-dashboard').style.display = 'block';
    document.getElementById('ui-model-name').innerText = title;
    document.getElementById('ui-model-file').innerText = filename;
    document.getElementById('color-picker').value = '#ffffff';
    
    activeModel = filename.toLowerCase();

    isCapVisible = false;
    document.getElementById('toggle-cap').checked = false;
    document.getElementById('cap-color-control').style.display = 'none';
    
    let userTuner = document.getElementById('user-manual-tuner-ui');
    if (userTuner) userTuner.style.display = 'none';

    injectManualButtonToUI();

    setTimeout(() => { init3D(filename); }, 150);
}

function closeDashboard() {
    document.getElementById('page-dashboard').style.display = 'none';
    document.getElementById('page-landing').style.display = 'block';
    
    let userTuner = document.getElementById('user-manual-tuner-ui');
    if (userTuner) userTuner.style.display = 'none';
    
    activeModel = '';

    if (renderer) {
        document.getElementById('canvas-container').innerHTML = '';
        renderer.dispose();
        renderer = null;
    }
}

function init3D(filename) {
    const container = document.getElementById('canvas-container');
    const loading = document.getElementById('loading-overlay');
    loading.style.display = 'block';
    
    if (renderer) { container.innerHTML = ''; renderer.dispose(); }
    
    document.getElementById('labels-container').innerHTML = '';
    annotationPoints = []; drawnLines = []; capMesh = null;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 3000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75); scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85); dirLight.position.set(200, 500, 300); scene.add(dirLight);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05;

    const loader = new THREE.STLLoader();
    loader.load(encodeURI('models/' + filename), function (geometry) {
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
        geometry.computeBoundingBox();
        
        const center = new THREE.Vector3(); geometry.boundingBox.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);
        
        object3D = new THREE.Mesh(geometry, material);
        
        const rotModels = ['jerigen.stl', 'waterbottle.stl', 'cube.stl', 'botol_300_cc.stl', 'botol_200_cc.stl', 'botol_100_cc.stl', 'botol_50_cc.stl', 'botol_60_cc_vicaris.stl'];
        if (rotModels.includes(filename)) object3D.rotation.x = -Math.PI / 2;
        
        scene.add(object3D);
        object3D.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(object3D);
        const size = new THREE.Vector3(); box.getSize(size);

        const features = detectHoleAndHandle(object3D.geometry, object3D.matrixWorld, box, size, filename);

        const botolSilinder = ['botol_pupuk_1_liter.stl', 'botol_m_1000_mk.stl', 'waterbottle.stl', 'botol_300_cc.stl', 'botol_200_cc.stl', 'botol_pet_sambal_jays.stl', 'botol_100_cc.stl', 'pet_250cc_barokah.stl', 'botol_50_cc.stl', 'botol_10_cc.stl', 'botol_m250.stl', 'botol_hdpe_100_cc_nok.stl', 'botol_60_cc_vicaris.stl', 'botol_pupuk_pet_50_ml.stl', 'botol_m500.stl', 'botol_m_100_cc.stl', 'botol_hdpe_m1000_petroka.stl'];
        const trafficCones = ['trafic_cone_with_hole.stl', 'trafic_cone_blow.stl'];
        const hidePanjang = botolSilinder.includes(filename) || trafficCones.includes(filename);
        
        let dimsHTML = '';
        if (!hidePanjang) dimsHTML += `<span style="color:#e74c3c">P: ${size.x.toFixed(1)} mm</span> | `;
        dimsHTML += `<span style="color:#3498db">L: ${size.z.toFixed(1)} mm</span> | <span style="color:#27ae60">T: ${size.y.toFixed(1)} mm</span>`;
        document.getElementById('main-dims').innerHTML = dimsHTML;
        
        drawDimensionLines(box, size, hidePanjang);
        createDetailedAnnotations(filename, box, size, features, botolSilinder, trafficCones);
        createCapMesh(filename, features, getCapSettings(filename, size));

        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.set(0, maxDim * 0.8, maxDim * 2.2);
        controls.target.set(0, 0, 0);
        loading.style.display = 'none';

        let tuner = document.getElementById('live-kordinat');
        if (tuner && capMesh && document.getElementById('user-manual-tuner-ui').style.display === 'block') {
            tuner.innerHTML = `X: ${capMesh.position.x.toFixed(1)}   Y: ${capMesh.position.y.toFixed(1)}   Z: ${capMesh.position.z.toFixed(1)}`;
        }

    }, undefined, function () { loading.innerText = "Error memuat STL"; loading.style.backgroundColor = "red"; });

    window.addEventListener('resize', onWindowResize, false);
    animate();
}

function createCapMesh(filename, features, config) {
    if (filename === 'trafic_cone_with_hole.stl' || filename === 'trafic_cone_blow.stl' || filename === 'cube.stl') return;
    
    let fileLower = filename.toLowerCase();
    
    let capY = features.drat.y - (config.height / 2) + (config.offsetY !== undefined ? config.offsetY : 1.5);
    let exactYModels = ['botol_200_cc.stl', 'botol_100_cc.stl', 'jerigen_5_liter_lebar_mk.stl', 'botol_m_100_cc.stl'];
    if (fileLower.includes('30_liter_chem') || fileLower.includes('pupuk_pet_50_ml') || exactYModels.includes(fileLower)) {
        capY = features.drat.y; 
    }

    let startX = features.drat.x;
    let startY = capY;
    let startZ = features.drat.z;

    let savedData = localStorage.getItem(`saved_cap_${fileLower}`);
    if (savedData) {
        try {
            let parsed = JSON.parse(savedData);
            startX = parsed.x; startY = parsed.y; startZ = parsed.z;
        } catch(e) {}
    }

    const capGeometry = new THREE.CylinderGeometry(config.radius, config.radius, config.height, 32);
    const capMaterial = new THREE.MeshStandardMaterial({ color: currentCapColor, roughness: 0.3, metalness: 0.1 });

    capMesh = new THREE.Mesh(capGeometry, capMaterial);
    capMesh.position.set(startX, startY, startZ);
    capMesh.visible = isCapVisible;
    scene.add(capMesh);
}

function toggleCap(checked) {
    isCapVisible = checked;
    if (capMesh) capMesh.visible = isCapVisible;
    document.getElementById('cap-color-control').style.display = checked ? 'block' : 'none';
}

function applyCapColor(hexValue) {
    currentCapColor = hexValue;
    if (capMesh) capMesh.material.color.set(hexValue);
    document.getElementById('cap-color-picker').value = hexValue;
}

function drawDimensionLines(box, size, hidePanjang) {
    const offset = Math.max(size.x, size.z) * 0.15; 
    
    function createLine(p1, p2, colorCode, labelText) {
        const mat = new THREE.LineBasicMaterial({ color: colorCode });
        const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const line = new THREE.Line(geom, mat);
        scene.add(line); drawnLines.push(line);

        const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const div = document.createElement('div');
        div.className = 'cad-label'; div.style.color = colorCode; div.innerText = labelText;
        document.getElementById('labels-container').appendChild(div);
        
        annotationPoints.push({ div: div, position: midPoint });
    }
    
    if (!hidePanjang) createLine(new THREE.Vector3(box.min.x, box.min.y, box.max.z + offset), new THREE.Vector3(box.max.x, box.min.y, box.max.z + offset), '#e74c3c', `P: ${size.x.toFixed(1)}mm`);
    createLine(new THREE.Vector3(box.max.x + offset, box.min.y, box.min.z), new THREE.Vector3(box.max.x + offset, box.min.y, box.max.z), '#3498db', `L: ${size.z.toFixed(1)}mm`);
    createLine(new THREE.Vector3(box.min.x - offset, box.min.y, box.max.z), new THREE.Vector3(box.min.x - offset, box.max.y, box.max.z), '#27ae60', `T: ${size.y.toFixed(1)}mm`);
}

function createDetailedAnnotations(filename, box, size, features, botolSilinder, trafficCones) {
    let labelsData = [];
    const drat = features.drat;
    const handle = features.handle;

    const isJerigen = !botolSilinder.includes(filename) && !trafficCones.includes(filename) && filename !== 'botol_kotak_1_kg.stl' && filename !== 'cube.stl';

    const valDiameterDalamJerigen = 'Ø ' + (size.x * 0.23).toFixed(1) + ' mm';
    const valDiameterDratJerigen = 'Ø ' + (size.x * 0.26).toFixed(1) + ' mm';
    const valHandleJerigen = (size.x * 0.28).toFixed(1) + ' mm';
    const valDiameterDalamBotol = 'Ø ' + (size.x * 0.35).toFixed(1) + ' mm';
    const valDiameterDratBotol = 'Ø ' + (size.x * 0.38).toFixed(1) + ' mm';
    const fileLower = filename.toLowerCase();

    if (isJerigen) {
        if (!fileLower.includes('20') && !fileLower.includes('30_liter_chem') && !fileLower.includes('5_liter_lebar_mk')) {
            const handleDir = handle.x > 0 ? 1 : -1;
            let handleOffsetY = 10;
            if (filename === 'jer_1_liter_lebar.stl') { handleOffsetY = 2; }
            if (filename === 'jerigen_05_liter.stl') { handleOffsetY = 2; }
            if (filename === 'botol_1_liter_panjang.stl') { handleOffsetY = 5; }
            if (filename === 'jerigen5_literAsia.STL' || filename === 'jerigen5 literAsia.STL') { handleOffsetY = 10; }
            
            const ptHandle = new THREE.Vector3(handle.x, handle.y - handleOffsetY, handle.z);
            labelsData.push({ title: 'HANDLE', val: valHandleJerigen, color: '#f39c12', targetPt: ptHandle, labelOffset: ptHandle.clone().add(new THREE.Vector3(handleDir * size.x * 0.4, 30, 0)) });
        }

        const dratDir = drat.x > 0 ? 1 : -1;
        let ringOffsetY = 12;
        if (filename === 'jer_1_liter_lebar.stl') { ringOffsetY = 8; }
        if (filename === 'jerigen_05_liter.stl') { ringOffsetY = 6; }
        if (filename === 'botol_1_liter_panjang.stl') { ringOffsetY = 8; }
        if (filename === 'jerigen5_literAsia.STL' || filename === 'jerigen5 literAsia.STL') { ringOffsetY = 12; }

        const ptDrat = new THREE.Vector3(drat.x, drat.y, drat.z);
        const ptRing = new THREE.Vector3(drat.x, drat.y - ringOffsetY, drat.z); 

        labelsData.push({ title: 'DIAMETER DALAM', val: valDiameterDalamJerigen, color: '#00e5ff', targetPt: ptDrat, labelOffset: ptDrat.clone().add(new THREE.Vector3(dratDir * size.x * 0.3, 40, 0)) });
        labelsData.push({ title: 'DIAMETER DRAT/RING', val: valDiameterDratJerigen, color: '#e67e22', targetPt: ptRing, labelOffset: ptRing.clone().add(new THREE.Vector3(dratDir * size.x * 0.5, 10, 0)) });

        if (filename === 'jerigen5_literAsia.STL' || filename === 'jerigen5 literAsia.STL') {
            labelsData[0].val = '81.0 mm'; labelsData[1].val = 'Ø 55.7 mm'; labelsData[2].val = 'Ø 48.5 mm';
            labelsData.push({ title: 'BODY DEPAN', val: '180.0 x 329.0 mm', color: '#2c3e50', targetPt: new THREE.Vector3(0, 0, box.max.z), labelOffset: new THREE.Vector3(-size.x*0.25, 0, box.max.z + 50) });
            labelsData.push({ title: 'BODY SAMPING', val: '122.9 x 329.0 mm', color: '#9b59b6', targetPt: new THREE.Vector3(box.max.x, 0, 0), labelOffset: new THREE.Vector3(box.max.x + 50, 0, 0) });
        }
    } 
    else if (trafficCones.includes(filename)) {
        labelsData = [{ title: 'DIAMETER DALAM', val: 'Ø ' + (size.x * 0.15).toFixed(1) + ' mm', color: '#00e5ff', targetPt: drat.clone(), labelOffset: drat.clone().add(new THREE.Vector3(-size.x*0.5, 30, 0)) }];
    } 
    else {
        labelsData = [
            { title: 'DIAMETER DALAM', val: valDiameterDalamBotol, color: '#00e5ff', targetPt: drat.clone(), labelOffset: drat.clone().add(new THREE.Vector3(-size.x*0.5, 30, 0)) },
            { title: 'DIAMETER DRAT/RING', val: valDiameterDratBotol, color: '#e67e22', targetPt: new THREE.Vector3(drat.x, drat.y - 8, drat.z), labelOffset: drat.clone().add(new THREE.Vector3(size.x*0.5, 10, 0)) }
        ];
    }

    labelsData.forEach(data => {
        const dotMat = new THREE.PointsMaterial({ color: data.color, size: 6 });
        scene.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints([data.targetPt]), dotMat));

        const lineMat = new THREE.LineBasicMaterial({ color: data.color });
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([data.targetPt, data.labelOffset]), lineMat));

        const div = document.createElement('div');
        div.className = 'cad-label'; div.style.color = data.color; div.innerHTML = `${data.title} <br><span>${data.val}</span>`;
        document.getElementById('labels-container').appendChild(div);
        
        annotationPoints.push({ div: div, position: data.labelOffset });
    });
}

function updateLabels() {
    if (annotationPoints.length === 0 || !camera) return;
    const widthHalf = window.innerWidth / 2; const heightHalf = window.innerHeight / 2;

    annotationPoints.forEach(anno => {
        const vector = anno.position.clone(); vector.project(camera);
        if (vector.z > 1) { anno.div.style.display = 'none'; } 
        else {
            anno.div.style.display = 'block';
            anno.div.style.left = (vector.x * widthHalf) + widthHalf + 'px';
            anno.div.style.top = -(vector.y * heightHalf) + heightHalf + 'px';
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update(); 
    if (renderer && scene && camera) { renderer.render(scene, camera); updateLabels(); }
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    if (container && renderer && camera) {
        camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
}

function applyColor(hexValue) {
    if(object3D) object3D.material.color.set(hexValue);
    document.getElementById('color-picker').value = hexValue;
}

function resetView() {
    if(camera && controls && object3D) {
        const box = new THREE.Box3().setFromObject(object3D); const size = new THREE.Vector3(); box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.set(0, maxDim * 0.8, maxDim * 2.2); controls.target.set(0,0,0); 
    }
}