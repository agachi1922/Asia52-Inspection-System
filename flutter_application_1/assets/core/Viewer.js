class Viewer {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.model = null;

        this.dimensionEngine = new DimensionEngine();
        this.featurePicker = new FeaturePicker();
        this.loaderManager = new STLLoaderManager();
        this.annotation = null;

        this.modelDimensions = null;
        this.modelFeatures = null;
        this.currentFileInfo = null;

        this.detailMeasureActive = false;
        this.detailFirstPoint = null;
        this.detailSecondPoint = null;
        this.detailMeasurementIndex = 1;
        this.manualMeasurements = [];

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.pointerDown = false;
        this.pointerStartX = 0;
        this.pointerStartY = 0;
        this.pointerMoved = false;
        this.pointerButton = -1;
        this.dragThreshold = 4;
    }

    init() {
        this.createScene();
        this.createCamera();
        this.createRenderer();
        this.createLights();
        this.createGrid();
        this.createControls();

        this.annotation = new CADAnnotation(this.scene);
        this.bindPointerEvents();
        window.addEventListener("resize", () => { this.resize(); });
        this.animate();
    }

    createScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xc9d9ea);
        this.scene.fog = new THREE.Fog(0xc9d9ea, 1200, 3200);
    }

    createCamera() {
        const width = Math.max(this.container.clientWidth, 1);
        const height = Math.max(this.container.clientHeight, 1);
        this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 6000);
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(-280, -620, 370);
    }

    createRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, precision: "highp", powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight, false);
        if ("outputColorSpace" in this.renderer) { this.renderer.outputColorSpace = THREE.SRGBColorSpace; }
        this.renderer.domElement.style.width = "100%";
        this.renderer.domElement.style.height = "100%";
        this.renderer.domElement.style.cursor = "grab";
        this.container.appendChild(this.renderer.domElement);
    }

    createLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.58); this.scene.add(ambient);
        const mainLight = new THREE.DirectionalLight(0xffffff, 0.82); mainLight.position.set(-350, -420, 520); this.scene.add(mainLight);
        const fillLight = new THREE.DirectionalLight(0xc5eff2, 0.26); fillLight.position.set(340, -120, 320); this.scene.add(fillLight);
        const sideLight = new THREE.DirectionalLight(0xffffff, 0.18); sideLight.position.set(200, 350, 220); this.scene.add(sideLight);
    }

    createGrid() {
        const grid = new THREE.GridHelper(2000, 160, 0x7495b6, 0x9db6cf);
        grid.rotation.x = Math.PI / 2; grid.position.z = -0.5;
        if (Array.isArray(grid.material)) { grid.material.forEach(m => { m.transparent = true; m.opacity = 0.50; }); } 
        else { grid.material.transparent = true; grid.material.opacity = 0.50; }
        this.scene.add(grid);
        this.createWorldAxis();
    }

    createWorldAxis() {
        const axisLength = 900;
        this.createSceneLine(new THREE.Vector3(-axisLength, 0, 0), new THREE.Vector3(axisLength, 0, 0), 0xd94757, 0.40);
        this.createSceneLine(new THREE.Vector3(0, -axisLength, 0), new THREE.Vector3(0, axisLength, 0), 0x43b85a, 0.40);
        this.createSceneLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, axisLength), 0x377fe3, 0.38);
    }

    createSceneLine(start, end, color, opacity = 1) {
        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const material = new THREE.LineBasicMaterial({ color: color, transparent: opacity < 1, opacity: opacity });
        const line = new THREE.Line(geometry, material);
        this.scene.add(line);
        return line;
    }

    createControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true; this.controls.dampingFactor = 0.06;
        this.controls.enableRotate = true; this.controls.enablePan = true; this.controls.enableZoom = true;
        this.controls.rotateSpeed = 0.60; this.controls.panSpeed = 0.65; this.controls.zoomSpeed = 0.85;
        this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
        this.controls.target.set(0, 0, 150);
        this.controls.update();
    }

    bindPointerEvents() {
        this.renderer.domElement.addEventListener("pointerdown", event => {
            this.pointerDown = true; this.pointerButton = event.button;
            this.pointerStartX = event.clientX; this.pointerStartY = event.clientY; this.pointerMoved = false;
        });

        this.renderer.domElement.addEventListener("pointermove", event => {
            if (!this.pointerDown) return;
            const dx = event.clientX - this.pointerStartX;
            const dy = event.clientY - this.pointerStartY;
            if (Math.sqrt(dx * dx + dy * dy) > this.dragThreshold) { this.pointerMoved = true; }
        });

        this.renderer.domElement.addEventListener("pointerup", event => {
            const wasMoved = this.pointerMoved; const button = this.pointerButton;
            this.pointerDown = false; this.pointerButton = -1;
            if (button === 0 && !wasMoved && this.detailMeasureActive) { this.handleDetailMeasureClick(event); }
        });

        this.renderer.domElement.addEventListener("contextmenu", event => { event.preventDefault(); });
    }

    loadLocalSTL(file) {
        if (!file) return;
        this.loaderManager.loadFile(file, (mesh, info) => { this.setModel(mesh, info); });
    }

    setModel(mesh, info) {
        if (this.model) {
            this.scene.remove(this.model);
            this.disposeModel(this.model);
            this.model = null;
        }

        if (this.annotation) { this.annotation.clearAll(); }

        this.detailMeasureActive = false;
        this.detailFirstPoint = null; this.detailSecondPoint = null;
        this.detailMeasurementIndex = 1; this.manualMeasurements = [];
        this.updateManualMeasurementList();

        this.model = mesh;
        this.currentFileInfo = info;
        this.scene.add(mesh);

        this.modelDimensions = this.dimensionEngine.measureModel(mesh);
        this.modelFeatures = this.featurePicker.estimate(mesh, this.modelDimensions);

        this.annotation.createDimensions(this.modelDimensions, this.modelFeatures);

        this.updateModelInformation();
        this.updateMeasurementTable();

        const emptyState = document.getElementById("emptyState");
        if (emptyState) { emptyState.style.display = "none"; }

        this.setDetailButtonState(false);
        this.fitCameraToModel();
    }

    disposeModel(model) {
        model.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => { if (material.map) material.map.dispose(); material.dispose(); });
                } else {
                    if (child.material.map) child.material.map.dispose(); child.material.dispose();
                }
            }
        });
    }

    updateModelInformation() {
        if (!this.modelDimensions || !this.modelFeatures) return;

        const d = this.modelDimensions;
        const f = this.modelFeatures;

        this.setText("fileName", this.currentFileInfo ? this.currentFileInfo.name : "-");
        this.setText("fileSize", this.currentFileInfo ? this.loaderManager.formatFileSize(this.currentFileInfo.size) : "-");
        this.setText("heightZ", d.heightZ.toFixed(1) + " mm");

        if (f.isFlatTop) {
            this.setText("lengthX", d.lengthX.toFixed(1) + " mm");
            this.setText("widthY", d.widthY.toFixed(1) + " mm");
            this.setText("handleLength", "-");
            this.setText("neckDiameter", "-");
            this.setText("innerDiameter", "-");
            this.setText("bodyFrontValue", "-");
            this.setText("bodySideValue", "-");
            this.setText("bodyBackValue", "-");
        } else if (f.isBottle) {
            this.setText("lengthX", d.lengthX.toFixed(1) + " mm (Diam)");
            this.setText("widthY", "- (Simetris)");
            this.setText("handleLength", "-");
            this.setText("neckDiameter", "Ø " + f.neckDiameter.toFixed(1) + " mm");
            this.setText("innerDiameter", "Ø " + f.innerDiameter.toFixed(1) + " mm");
            this.setText("bodyFrontValue", "-");
            this.setText("bodySideValue", "-");
            this.setText("bodyBackValue", "-");
        } else {
            this.setText("lengthX", d.lengthX.toFixed(1) + " mm");
            this.setText("widthY", d.widthY.toFixed(1) + " mm");
            this.setText("handleLength", f.handleLength.toFixed(1) + " mm");
            this.setText("neckDiameter", "Ø " + f.neckDiameter.toFixed(1) + " mm");
            this.setText("innerDiameter", "Ø " + f.innerDiameter.toFixed(1) + " mm");
            this.setText("bodyFrontValue", d.lengthX.toFixed(1) + " × " + d.heightZ.toFixed(1) + " mm");
            this.setText("bodySideValue", d.widthY.toFixed(1) + " × " + d.heightZ.toFixed(1) + " mm");
            this.setText("bodyBackValue", d.lengthX.toFixed(1) + " × " + d.heightZ.toFixed(1) + " mm");
        }
    }

    updateMeasurementTable() {
        if (!this.modelDimensions || !this.modelFeatures) return;

        const d = this.modelDimensions;
        const f = this.modelFeatures;

        this.setText("tableHeight", d.heightZ.toFixed(1) + " mm");

        if (f.isFlatTop) {
            this.setText("tableLength", d.lengthX.toFixed(1) + " mm");
            this.setText("tableWidth", d.widthY.toFixed(1) + " mm");
            this.setText("tableHandle", "-");
            this.setText("tableDrat", "-");
            this.setText("tableInnerDiameter", "-");
            this.setText("tableBodyFront", "-");
            this.setText("tableBodySide", "-");
            this.setText("tableBodyBack", "-");
        } else if (f.isBottle) {
            this.setText("tableLength", d.lengthX.toFixed(1) + " mm (Diam)");
            this.setText("tableWidth", "- (Simetris)");
            this.setText("tableHandle", "-");
            this.setText("tableDrat", "Ø " + f.neckDiameter.toFixed(1) + " mm");
            this.setText("tableInnerDiameter", "Ø " + f.innerDiameter.toFixed(1) + " mm");
            this.setText("tableBodyFront", "-");
            this.setText("tableBodySide", "-");
            this.setText("tableBodyBack", "-");
        } else {
            this.setText("tableLength", d.lengthX.toFixed(1) + " mm");
            this.setText("tableWidth", d.widthY.toFixed(1) + " mm");
            this.setText("tableHandle", f.handleLength.toFixed(1) + " mm");
            this.setText("tableDrat", "Ø " + f.neckDiameter.toFixed(1) + " mm");
            this.setText("tableInnerDiameter", "Ø " + f.innerDiameter.toFixed(1) + " mm");
            this.setText("tableBodyFront", d.lengthX.toFixed(1) + " × " + d.heightZ.toFixed(1) + " mm");
            this.setText("tableBodySide", d.widthY.toFixed(1) + " × " + d.heightZ.toFixed(1) + " mm");
            this.setText("tableBodyBack", d.lengthX.toFixed(1) + " × " + d.heightZ.toFixed(1) + " mm");
        }
    }

    setText(id, value) {
        const element = document.getElementById(id);
        if (element) { element.textContent = value; }
    }

    toggleDetailMeasure() {
        if (!this.model) { alert("Import model STL terlebih dahulu."); return; }
        this.detailMeasureActive = !this.detailMeasureActive;
        this.detailFirstPoint = null; this.detailSecondPoint = null;
        this.annotation.clearSelection();
        this.setDetailButtonState(this.detailMeasureActive);

        const hint = document.getElementById("measureHint");
        if (hint) { hint.style.display = this.detailMeasureActive ? "block" : "none"; }
        this.renderer.domElement.style.cursor = this.detailMeasureActive ? "crosshair" : "grab";
    }

    setDetailButtonState(active) {
        const button = document.getElementById("detailMeasureBtn");
        if (!button) return;
        if (active) { button.classList.add("active"); } else { button.classList.remove("active"); }
    }

    handleDetailMeasureClick(event) {
        if (!this.model || !this.detailMeasureActive) return;
        const point = this.pickModelPoint(event);
        if (!point) return;

        if (!this.detailFirstPoint) {
            this.detailFirstPoint = point.clone();
            this.annotation.showManualSelectionPoint(this.detailFirstPoint, 0x00d0da);
            const hint = document.getElementById("measureHint");
            if (hint) { hint.innerHTML = `DETAIL MEASURE AKTIF<span>Titik pertama dipilih. Klik titik kedua.</span>`; }
            return;
        }

        this.detailSecondPoint = point.clone();
        this.annotation.showManualSelectionPoint(this.detailSecondPoint, 0x00d0da);

        const distance = this.annotation.createManualDimension(this.detailFirstPoint, this.detailSecondPoint, this.detailMeasurementIndex);
        this.manualMeasurements.push({ index: this.detailMeasurementIndex, value: distance });
        this.detailMeasurementIndex++;
        this.detailFirstPoint = null; this.detailSecondPoint = null;
        this.annotation.clearSelection();
        this.updateManualMeasurementList();

        const hint = document.getElementById("measureHint");
        if (hint) { hint.innerHTML = `DETAIL MEASURE AKTIF<span>Ukuran tersimpan. Klik titik pertama berikutnya.</span>`; }
    }

    pickModelPoint(event) {
        if (!this.model) return null;
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObject(this.model, false);
        if (hits.length === 0) return null;
        return hits[0].point.clone();
    }

    clearManualMeasurements() {
        this.manualMeasurements = []; this.detailMeasurementIndex = 1;
        this.detailFirstPoint = null; this.detailSecondPoint = null;
        this.annotation.clearManual(); this.annotation.clearSelection();
        this.updateManualMeasurementList();

        if (this.detailMeasureActive) {
            const hint = document.getElementById("measureHint");
            if (hint) { hint.innerHTML = `DETAIL MEASURE AKTIF<span>Klik titik pertama lalu titik kedua pada jerigen</span>`; }
        }
    }

    updateManualMeasurementList() {
        const container = document.getElementById("manualMeasurements");
        if (!container) return;
        if (this.manualMeasurements.length === 0) { container.innerHTML = "Belum ada pengukuran detail."; return; }
        container.innerHTML = "";

        this.manualMeasurements.forEach(m => {
            const row = document.createElement("div"); row.className = "data-row";
            const name = document.createElement("span"); name.className = "data-label"; name.textContent = "Detail " + m.index;
            const value = document.createElement("span"); value.className = "data-value"; value.textContent = m.value.toFixed(2) + " mm";
            row.appendChild(name); row.appendChild(value); container.appendChild(row);
        });
    }

    fitCameraToModel() {
        if (!this.model) return;
        const box = new THREE.Box3().setFromObject(this.model);
        const size = new THREE.Vector3(); const center = new THREE.Vector3();
        box.getSize(size); box.getCenter(center);
        const largest = Math.max(size.x, size.y, size.z);
        const distance = largest * 2.15;
        this.camera.position.set(center.x - distance * 0.22, center.y - distance * 1.00, center.z + distance * 0.35);
        this.camera.up.set(0, 0, 1);
        this.controls.target.copy(center);
        this.camera.near = Math.max(largest / 1000, 0.1);
        this.camera.far = distance * 25;
        this.camera.updateProjectionMatrix();
        this.controls.update();
    }

    resetView() { if (!this.model) return; this.fitCameraToModel(); }

    getCameraData() {
        if (!this.model) return null;
        const box = new THREE.Box3().setFromObject(this.model);
        const center = new THREE.Vector3(); const size = new THREE.Vector3();
        box.getCenter(center); box.getSize(size);
        return { center: center, distance: Math.max(size.x, size.y, size.z) * 2.20 };
    }

    setFrontView() {
        if (!this.model) return; const data = this.getCameraData();
        this.camera.position.set(data.center.x, data.center.y - data.distance, data.center.z);
        this.camera.up.set(0, 0, 1); this.controls.target.copy(data.center); this.controls.update();
    }

    setTopView() {
        if (!this.model) return; const data = this.getCameraData();
        this.camera.position.set(data.center.x, data.center.y, data.center.z + data.distance);
        this.camera.up.set(0, 1, 0); this.controls.target.copy(data.center); this.controls.update();
    }

    setRightView() {
        if (!this.model) return; const data = this.getCameraData();
        this.camera.position.set(data.center.x + data.distance, data.center.y, data.center.z);
        this.camera.up.set(0, 0, 1); this.controls.target.copy(data.center); this.controls.update();
    }

    resize() {
        const width = this.container.clientWidth; const height = this.container.clientHeight;
        if (width <= 0 || height <= 0) return;
        this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
        this.renderer.setSize(width, height, false);
    }

    animate() {
        requestAnimationFrame(() => { this.animate(); });
        if (this.controls) { this.controls.update(); }
        this.renderer.render(this.scene, this.camera);
    }
}