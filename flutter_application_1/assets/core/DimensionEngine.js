class DimensionEngine {
    constructor() { this.lastResult = null; }

    measureModel(mesh) {
        if (!mesh) throw new Error("DimensionEngine: mesh tidak tersedia.");
        mesh.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(mesh);
        if (box.isEmpty()) throw new Error("DimensionEngine: bounding box model kosong.");

        const size = new THREE.Vector3(); box.getSize(size);
        const center = new THREE.Vector3(); box.getCenter(center);
        const min = box.min.clone(); const max = box.max.clone();

        const lengthX = Math.abs(max.x - min.x);
        const widthY = Math.abs(max.y - min.y);
        const heightZ = Math.abs(max.z - min.z);
        const diagonal = Math.sqrt(lengthX * lengthX + widthY * widthY + heightZ * heightZ);
        const volumeBoundingBox = lengthX * widthY * heightZ;

        const xMinPoint = new THREE.Vector3(min.x, center.y, center.z);
        const xMaxPoint = new THREE.Vector3(max.x, center.y, center.z);
        const yMinPoint = new THREE.Vector3(center.x, min.y, center.z);
        const yMaxPoint = new THREE.Vector3(center.x, max.y, center.z);
        const zMinPoint = new THREE.Vector3(center.x, center.y, min.z);
        const zMaxPoint = new THREE.Vector3(center.x, center.y, max.z);

        const corners = {
            minMinMin: new THREE.Vector3(min.x, min.y, min.z), maxMinMin: new THREE.Vector3(max.x, min.y, min.z),
            minMaxMin: new THREE.Vector3(min.x, max.y, min.z), maxMaxMin: new THREE.Vector3(max.x, max.y, min.z),
            minMinMax: new THREE.Vector3(min.x, min.y, max.z), maxMinMax: new THREE.Vector3(max.x, min.y, max.z),
            minMaxMax: new THREE.Vector3(min.x, max.y, max.z), maxMaxMax: new THREE.Vector3(max.x, max.y, max.z)
        };

        const result = { box: box.clone(), min, max, size, center, lengthX, widthY, heightZ, diagonal, volumeBoundingBox, xMinPoint, xMaxPoint, yMinPoint, yMaxPoint, zMinPoint, zMaxPoint, corners };
        this.lastResult = result;
        return result;
    }

    distance(pointA, pointB) { return (!pointA || !pointB) ? 0 : pointA.distanceTo(pointB); }
    distanceX(pointA, pointB) { return (!pointA || !pointB) ? 0 : Math.abs(pointB.x - pointA.x); }
    distanceY(pointA, pointB) { return (!pointA || !pointB) ? 0 : Math.abs(pointB.y - pointA.y); }
    distanceZ(pointA, pointB) { return (!pointA || !pointB) ? 0 : Math.abs(pointB.z - pointA.z); }
    midpoint(pointA, pointB) { return (!pointA || !pointB) ? new THREE.Vector3() : pointA.clone().lerp(pointB, 0.5); }
    formatMM(value, decimals = 1) { return (!Number.isFinite(value)) ? "-" : (value.toFixed(decimals) + " mm"); }
    formatDiameter(value, decimals = 1) { return (!Number.isFinite(value)) ? "-" : ("Ø " + value.toFixed(decimals) + " mm"); }
}