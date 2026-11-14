class FeaturePicker {
    constructor() {}

    estimate(mesh, dimensions) {
        if (!mesh || !dimensions) return null;
        mesh.updateMatrixWorld(true);

        const box = dimensions.box;
        const size = dimensions.size;
        const center = dimensions.center;

        const lengthX = size.x;
        const widthY = size.y;
        const heightZ = size.z;

        /* =====================================================
           IDENTIFIKASI BENTUK: KUBUS vs BOTOL vs JERIGEN
        ===================================================== */
        let isFlatTop = false;
        const positions = mesh.geometry.attributes.position;
        const vertex = new THREE.Vector3();
        
        let topMinX = Infinity, topMaxX = -Infinity;
        let topMinY = Infinity, topMaxY = -Infinity;
        const topThreshold = box.max.z - (heightZ * 0.02);

        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i);
            vertex.applyMatrix4(mesh.matrixWorld);
            if (vertex.z >= topThreshold) {
                topMinX = Math.min(topMinX, vertex.x); topMaxX = Math.max(topMaxX, vertex.x);
                topMinY = Math.min(topMinY, vertex.y); topMaxY = Math.max(topMaxY, vertex.y);
            }
        }
        
        const topArea = (topMaxX - topMinX) * (topMaxY - topMinY);
        const baseArea = lengthX * widthY;
        if (topArea > (baseArea * 0.5)) isFlatTop = true;

        let isBottle = false;
        if (!isFlatTop) {
            isBottle = (Math.abs(lengthX - widthY) / Math.max(lengthX, widthY)) < 0.15;
        }

        /* =====================================================
           PEAK ISOLATOR (Fokus Pada Pucuk Botol)
        ===================================================== */
        let highestZ = -Infinity;
        let peakPoint = new THREE.Vector3();

        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i);
            vertex.applyMatrix4(mesh.matrixWorld);
            if (vertex.z > highestZ) {
                highestZ = vertex.z;
                peakPoint.copy(vertex);
            }
        }

        const neckThreshold = highestZ - (heightZ * 0.10);
        const searchRadius = Math.max(lengthX, widthY) * 0.35;
        
        let neckMinX = Infinity, neckMaxX = -Infinity;
        let neckMinY = Infinity, neckMaxY = -Infinity;
        let neckMinZ = Infinity, neckMaxZ = -Infinity;
        let foundNeck = false;

        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i);
            vertex.applyMatrix4(mesh.matrixWorld);

            if (vertex.z >= neckThreshold) {
                // Jangan hitung gagang, hanya hitung yang berdekatan dengan puncak drat
                if (Math.hypot(vertex.x - peakPoint.x, vertex.y - peakPoint.y) <= searchRadius) {
                    foundNeck = true;
                    if (vertex.x < neckMinX) neckMinX = vertex.x;
                    if (vertex.x > neckMaxX) neckMaxX = vertex.x;
                    if (vertex.y < neckMinY) neckMinY = vertex.y;
                    if (vertex.y > neckMaxY) neckMaxY = vertex.y;
                    if (vertex.z < neckMinZ) neckMinZ = vertex.z;
                    if (vertex.z > neckMaxZ) neckMaxZ = vertex.z;
                }
            }
        }

        let neckCenterX = center.x;
        let neckCenterY = center.y;
        let dratDiameter = Math.min(lengthX, widthY) * 0.45;

        if (foundNeck && neckMaxX !== -Infinity) {
            neckCenterX = (neckMinX + neckMaxX) / 2;
            neckCenterY = (neckMinY + neckMaxY) / 2;
            dratDiameter = Math.max(neckMaxX - neckMinX, neckMaxY - neckMinY);
        }

        if (dratDiameter > Math.min(lengthX, widthY) * 0.8) dratDiameter = Math.min(lengthX, widthY) * 0.8;

        const innerDiameter = dratDiameter * 0.65;
        const dratRadius = dratDiameter / 2;
        const innerRadius = innerDiameter / 2;

        /* =====================================================
           TITIK DRAT DAN INNER
        ===================================================== */
        const ringCenterZ = isFlatTop ? box.max.z : neckMinZ + ((highestZ - neckMinZ) * 0.2);
        const ringCenter = new THREE.Vector3(neckCenterX, neckCenterY, ringCenterZ);

        const dratRingLeft = new THREE.Vector3(ringCenter.x - dratRadius, ringCenter.y, ringCenter.z);
        const dratRingRight = new THREE.Vector3(ringCenter.x + dratRadius, ringCenter.y, ringCenter.z);
        const ringAnchorAngle = THREE.MathUtils.degToRad(-52);
        const dratRingAnchor = new THREE.Vector3(
            ringCenter.x + Math.cos(ringAnchorAngle) * dratRadius, ringCenter.y, ringCenter.z + Math.sin(ringAnchorAngle) * dratRadius * 0.30
        );

        const innerCenter = new THREE.Vector3(neckCenterX, neckCenterY, highestZ);
        const innerLeft = new THREE.Vector3(innerCenter.x - innerRadius, innerCenter.y, innerCenter.z);
        const innerRight = new THREE.Vector3(innerCenter.x + innerRadius, innerCenter.y, innerCenter.z);
        const innerDratAnchor = innerCenter.clone();

        /* =====================================================
           HANDLE (Hanya Jerigen)
        ===================================================== */
        let handleStart = null, handleEnd = null, handleLength = 0;
        let frontCenter = null, sideCenter = null, backCenter = null;

        if (!isBottle && !isFlatTop) {
            handleLength = lengthX * 0.45;
            let handleCenterX = center.x;
            
            if (neckCenterX > center.x + lengthX * 0.05) handleCenterX = box.min.x + (lengthX * 0.35);
            else if (neckCenterX < center.x - lengthX * 0.05) handleCenterX = box.max.x - (lengthX * 0.35);
            else handleCenterX = box.min.x + (lengthX * 0.35);

            const handleY = box.min.y + (widthY * 0.26);
            const handleZ = box.min.z + (heightZ * 0.88);

            handleStart = new THREE.Vector3(handleCenterX - handleLength / 2, handleY, handleZ);
            handleEnd = new THREE.Vector3(handleCenterX + handleLength / 2, handleY, handleZ);

            frontCenter = new THREE.Vector3(center.x, box.min.y - 3, box.min.z + heightZ * 0.50);
            sideCenter = new THREE.Vector3(box.max.x + 3, center.y, box.min.z + heightZ * 0.50);
            backCenter = new THREE.Vector3(center.x, box.max.y + 3, box.min.z + heightZ * 0.50);
        }

        return {
            box: box.clone(), size: size.clone(), center: center.clone(),
            isBottle, isFlatTop,
            handleStart, handleEnd, handleLength,
            dratDiameter, neckDiameter: dratDiameter, dratRadius,
            dratCenter: ringCenter, dratRingCenter: ringCenter, dratStart: dratRingLeft, dratEnd: dratRingRight,
            dratRingLeft, dratRingRight, dratAnchor: dratRingAnchor, dratRingAnchor,
            innerDiameter, innerRadius, innerCenter, innerDratCenter: innerCenter,
            innerDratStart: innerLeft, innerDratEnd: innerRight, innerDratLeft: innerLeft, innerDratRight: innerRight, innerDratAnchor,
            frontCenter, sideCenter, backCenter
        };
    }
}