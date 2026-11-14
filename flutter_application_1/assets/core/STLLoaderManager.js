class STLLoaderManager {
    constructor() { this.loader = new THREE.STLLoader(); }

    loadFile(file, callback) {
        const reader = new FileReader();
        reader.onload = event => {
            try {
                const geometry = this.loader.parse(event.target.result);
                const mesh = this.createMesh(geometry);
                callback(mesh, { name: file.name, size: file.size });
            } catch (error) {
                console.error("Gagal membaca STL:", error); alert("File STL gagal dibaca.");
            }
        };
        reader.onerror = () => { alert("Terjadi kesalahan saat membaca file."); };
        reader.readAsArrayBuffer(file);
    }

    createMesh(geometry) {
        // ORIGINAL: Dibiarkan persis seperti aslinya karena sudah di-override di index.html
        geometry.rotateX(Math.PI / 2);

        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: false, opacity: 1.0, side: THREE.DoubleSide, depthTest: true, depthWrite: true, wireframe: false });
        const mesh = new THREE.Mesh(geometry, bodyMaterial);
        mesh.name = "JerigenSTL"; mesh.renderOrder = 1;

        const detailGeometry = new THREE.EdgesGeometry(geometry, 4);
        const detailMaterial = new THREE.LineBasicMaterial({ color: 0x5f6870, transparent: true, opacity: 0.48, depthTest: true, depthWrite: false });
        const detailEdges = new THREE.LineSegments(detailGeometry, detailMaterial);
        detailEdges.name = "JerigenDetailEdges"; detailEdges.renderOrder = 2;
        mesh.add(detailEdges);

        const outlineGeometry = new THREE.EdgesGeometry(geometry, 18);
        const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x333a40, transparent: true, opacity: 0.82, depthTest: true, depthWrite: false });
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
        outline.name = "JerigenOutline"; outline.renderOrder = 3;
        mesh.add(outline);

        this.placeStanding(mesh);
        return mesh;
    }

    placeStanding(mesh) {
        mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(mesh);
        const center = new THREE.Vector3();
        box.getCenter(center);
        mesh.position.x -= center.x; mesh.position.y -= center.y; mesh.position.z -= box.min.z;
        mesh.updateMatrixWorld(true);
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return (bytes + " B");
        if (bytes < 1048576) return ((bytes / 1024).toFixed(2) + " KB");
        return ((bytes / 1048576).toFixed(2) + " MB");
    }
}