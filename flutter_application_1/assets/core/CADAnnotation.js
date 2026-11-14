class CADAnnotation {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.manualGroup = new THREE.Group();
        this.selectionGroup = new THREE.Group();

        this.group.name = "CAD_AUTOMATIC_DIMENSIONS";
        this.manualGroup.name = "CAD_MANUAL_DIMENSIONS";
        this.selectionGroup.name = "CAD_SELECTION";

        this.scene.add(this.group); this.scene.add(this.manualGroup); this.scene.add(this.selectionGroup);
        this.currentScale = 1;
    }

    clearAll() { this.clear(); this.clearManual(); this.clearSelection(); }
    clear() { this.disposeGroup(this.group); }
    clearManual() { this.disposeGroup(this.manualGroup); }
    clearSelection() { this.disposeGroup(this.selectionGroup); }

    disposeGroup(group) {
        while (group.children.length > 0) {
            const object = group.children[0];
            group.remove(object);
            this.disposeObject(object);
        }
    }

    disposeObject(object) {
        object.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) { child.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } 
                else { if (child.material.map) child.material.map.dispose(); child.material.dispose(); }
            }
        });
    }

    addLine(start, end, color, dashed = false, targetGroup = this.group) {
        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        let material = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }) 
                              : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
        const line = new THREE.Line(geometry, material);
        if (dashed) line.computeLineDistances();
        line.renderOrder = 900;
        targetGroup.add(line);
        return line;
    }

    addPolyline(points, color, targetGroup = this.group) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 900;
        targetGroup.add(line);
        return line;
    }

    addPoint(position, color, targetGroup = this.group, radius = 2) {
        const geometry = new THREE.SphereGeometry(radius, 18, 18);
        const material = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
        const point = new THREE.Mesh(geometry, material);
        point.position.copy(position);
        point.renderOrder = 950;
        targetGroup.add(point);
        return point;
    }

    addTick(position, direction, color, length = 7, targetGroup = this.group) {
        let vector = direction.clone();
        if (vector.lengthSq() < 0.0001) vector.set(1, 0, 0);
        vector.normalize().multiplyScalar(length / 2);
        this.addLine(position.clone().sub(vector), position.clone().add(vector), color, false, targetGroup);
    }

    addDimension(start, end, color, targetGroup = this.group, tickLength = 7) {
        this.addLine(start, end, color, false, targetGroup);
        const direction = end.clone().sub(start);
        let tickDirection = new THREE.Vector3(-direction.y, direction.x, 0);
        if (tickDirection.lengthSq() < 0.0001) tickDirection.set(1, 0, 0);
        this.addTick(start, tickDirection, color, tickLength, targetGroup);
        this.addTick(end, tickDirection, color, tickLength, targetGroup);
    }

    colorCSS(hex) {
        const c = new THREE.Color(hex);
        return "rgb(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + ")";
    }

    addLabel(title, value, position, color, targetGroup = this.group, width = 78, height = 23) {
        const canvas = document.createElement("canvas");
        canvas.width = 2000; canvas.height = 600;
        const context = canvas.getContext("2d");

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.textAlign = "center"; context.textBaseline = "middle";
        context.font = "900 92px Arial"; context.lineWidth = 5;
        context.strokeStyle = "rgba(255,255,255,0.46)"; context.fillStyle = "#15202A";
        context.strokeText(title, 1000, 175); context.fillText(title, 1000, 175);

        context.font = "900 124px Arial"; context.lineWidth = 8;
        context.strokeStyle = "rgba(12,18,24,0.28)"; context.fillStyle = this.colorCSS(color);
        context.strokeText(value, 1000, 390); context.fillText(value, 1000, 390);

        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;

        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(position);
        sprite.scale.set(width, height, 1);
        sprite.renderOrder = 1000;
        targetGroup.add(sprite);
        return sprite;
    }

    createDimensions(d, f) {
        this.clear();

        const RED = 0xef3345, GREEN = 0x35c44c, BLUE = 0x3479ed, YELLOW = 0xf0bd00;
        const ORANGE = 0xef7a19, CYAN = 0x00cbd6, PURPLE = 0x9b4bc1, EXTENSION = 0x66717a;

        const maxDim = Math.max(d.lengthX, d.widthY, d.heightZ);
        const scale = maxDim / 329.0;
        this.currentScale = scale;
        const padX = 25 * scale; const padZ = 34 * scale; const tickL = 7 * scale;

        if (f.isFlatTop) {
            const xY = d.min.y - padX;
            const xStart = new THREE.Vector3(d.min.x, xY, d.min.z + (3 * scale));
            const xEnd = new THREE.Vector3(d.max.x, xY, d.min.z + (3 * scale));
            this.addLine(new THREE.Vector3(d.min.x, d.min.y, d.min.z + (3 * scale)), xStart, EXTENSION, true);
            this.addLine(new THREE.Vector3(d.max.x, d.min.y, d.min.z + (3 * scale)), xEnd, EXTENSION, true);
            this.addDimension(xStart, xEnd, RED, this.group, tickL);
            const xLabel = xStart.clone().lerp(xEnd, 0.5); xLabel.y -= (13 * scale);
            this.addLabel("PANJANG X", d.lengthX.toFixed(1) + " mm", xLabel, RED, this.group, 78 * scale, 23 * scale);

            const yX = d.max.x + padX;
            const yStart = new THREE.Vector3(yX, d.min.y, d.min.z + (5 * scale));
            const yEnd = new THREE.Vector3(yX, d.max.y, d.min.z + (5 * scale));
            this.addLine(new THREE.Vector3(d.max.x, d.min.y, d.min.z + (5 * scale)), yStart, EXTENSION, true);
            this.addLine(new THREE.Vector3(d.max.x, d.max.y, d.min.z + (5 * scale)), yEnd, EXTENSION, true);
            this.addDimension(yStart, yEnd, GREEN, this.group, tickL);
            const yLabel = yStart.clone().lerp(yEnd, 0.5); yLabel.x += (20 * scale);
            this.addLabel("LEBAR Y", d.widthY.toFixed(1) + " mm", yLabel, GREEN, this.group, 78 * scale, 23 * scale);
        } else if (f.isBottle) {
            const xY = d.min.y - padX;
            const diamStart = new THREE.Vector3(d.min.x, xY, d.min.z + (5 * scale));
            const diamEnd = new THREE.Vector3(d.max.x, xY, d.min.z + (5 * scale));
            this.addLine(new THREE.Vector3(d.min.x, d.min.y, d.min.z + (5 * scale)), diamStart, EXTENSION, true);
            this.addLine(new THREE.Vector3(d.max.x, d.min.y, d.min.z + (5 * scale)), diamEnd, EXTENSION, true);
            this.addDimension(diamStart, diamEnd, RED, this.group, tickL);
            const diamLabel = diamStart.clone().lerp(diamEnd, 0.5); diamLabel.y -= (13 * scale);
            this.addLabel("DIAMETER BODY", d.lengthX.toFixed(1) + " mm", diamLabel, RED, this.group, 85 * scale, 23 * scale);
        } else {
            const xY = d.min.y - padX;
            const xStart = new THREE.Vector3(d.min.x, xY, d.min.z + (3 * scale));
            const xEnd = new THREE.Vector3(d.max.x, xY, d.min.z + (3 * scale));
            this.addLine(new THREE.Vector3(d.min.x, d.min.y, d.min.z + (3 * scale)), xStart, EXTENSION, true);
            this.addLine(new THREE.Vector3(d.max.x, d.min.y, d.min.z + (3 * scale)), xEnd, EXTENSION, true);
            this.addDimension(xStart, xEnd, RED, this.group, tickL);
            const xLabel = xStart.clone().lerp(xEnd, 0.5); xLabel.y -= (13 * scale);
            this.addLabel("PANJANG X", d.lengthX.toFixed(1) + " mm", xLabel, RED, this.group, 78 * scale, 23 * scale);

            const yX = d.max.x + padX;
            const yStart = new THREE.Vector3(yX, d.min.y, d.min.z + (5 * scale));
            const yEnd = new THREE.Vector3(yX, d.max.y, d.min.z + (5 * scale));
            this.addLine(new THREE.Vector3(d.max.x, d.min.y, d.min.z + (5 * scale)), yStart, EXTENSION, true);
            this.addLine(new THREE.Vector3(d.max.x, d.max.y, d.min.z + (5 * scale)), yEnd, EXTENSION, true);
            this.addDimension(yStart, yEnd, GREEN, this.group, tickL);
            const yLabel = yStart.clone().lerp(yEnd, 0.5); yLabel.x += (20 * scale);
            this.addLabel("LEBAR Y", d.widthY.toFixed(1) + " mm", yLabel, GREEN, this.group, 78 * scale, 23 * scale);

            if (f.handleStart && f.handleEnd) {
                const offset = new THREE.Vector3(0, -17 * scale, 17 * scale);
                const start = f.handleStart.clone().add(offset);
                const end = f.handleEnd.clone().add(offset);
                this.addLine(f.handleStart, start, EXTENSION, true);
                this.addLine(f.handleEnd, end, EXTENSION, true);
                this.addDimension(start, end, YELLOW, this.group, tickL);
                const label = start.clone().lerp(end, 0.5); label.z += (16 * scale);
                this.addLabel("HANDLE", f.handleLength.toFixed(1) + " mm", label, YELLOW, this.group, 67 * scale, 20 * scale);
            }

            if (f.frontCenter) {
                const position = f.frontCenter.clone(); position.y -= (26 * scale); position.z -= (22 * scale);
                this.addLabel("BODY DEPAN", d.lengthX.toFixed(1) + " × " + d.heightZ.toFixed(1) + " mm", position, PURPLE, this.group, 90 * scale, 24 * scale);
            }
            if (f.sideCenter) {
                const position = f.sideCenter.clone(); position.x += (40 * scale); position.z += (48 * scale);
                this.addLabel("BODY SAMPING", d.widthY.toFixed(1) + " × " + d.heightZ.toFixed(1) + " mm", position, PURPLE, this.group, 92 * scale, 25 * scale);
            }
            if (f.backCenter) {
                const position = f.backCenter.clone(); position.y += (26 * scale); position.z -= (20 * scale);
                this.addLabel("BODY BELAKANG", d.lengthX.toFixed(1) + " × " + d.heightZ.toFixed(1) + " mm", position, PURPLE, this.group, 92 * scale, 25 * scale);
            }
        }

        const zX = d.max.x + padZ;
        const zStart = new THREE.Vector3(zX, d.center.y, d.min.z);
        const zEnd = new THREE.Vector3(zX, d.center.y, d.max.z);
        this.addLine(new THREE.Vector3(d.max.x, d.center.y, d.min.z), zStart, EXTENSION, true);
        this.addLine(new THREE.Vector3(d.max.x, d.center.y, d.max.z), zEnd, EXTENSION, true);
        this.addDimension(zStart, zEnd, BLUE, this.group, tickL);
        const zLabel = zStart.clone().lerp(zEnd, 0.5); zLabel.x += (38 * scale); zLabel.z -= (30 * scale);
        this.addLabel("TINGGI Z", d.heightZ.toFixed(1) + " mm", zLabel, BLUE, this.group, 72 * scale, 22 * scale);

        if (!f.isFlatTop) {
            if (f.innerDratAnchor) {
                const innerStart = f.innerDratAnchor.clone();
                this.addPoint(innerStart, CYAN, this.group, 2.8 * scale);
                const innerCorner = innerStart.clone().add(new THREE.Vector3(45 * scale, 0, 18 * scale));
                const innerEnd = innerCorner.clone().add(new THREE.Vector3(75 * scale, 0, 0));
                this.addPolyline([innerStart, innerCorner, innerEnd], CYAN);
                this.addPoint(innerEnd, CYAN, this.group, 1.8 * scale);
                const innerLabel = innerEnd.clone(); innerLabel.x += (45 * scale); innerLabel.z += (2 * scale);
                this.addLabel("DIAMETER DALAM Ø", "Ø " + f.innerDiameter.toFixed(1) + " mm", innerLabel, CYAN, this.group, 94 * scale, 24 * scale);
            }
            if (f.dratRingAnchor) {
                const ringStart = f.dratRingAnchor.clone();
                this.addPoint(ringStart, ORANGE, this.group, 2.8 * scale);
                const ringCorner = ringStart.clone().add(new THREE.Vector3(48 * scale, 0, -7 * scale));
                const ringEnd = ringCorner.clone().add(new THREE.Vector3(72 * scale, 0, 0));
                this.addPolyline([ringStart, ringCorner, ringEnd], ORANGE);
                this.addPoint(ringEnd, ORANGE, this.group, 1.8 * scale);
                const ringLabel = ringEnd.clone(); ringLabel.x += (45 * scale);
                this.addLabel("DRAT / RING Ø", "Ø " + f.dratDiameter.toFixed(1) + " mm", ringLabel, ORANGE, this.group, 90 * scale, 24 * scale);
            }
        }
    }

    showManualSelectionPoint(position, color = 0x00cbd6) {
        const scale = this.currentScale || 1;
        this.addPoint(position, color, this.selectionGroup, 2.5 * scale);
    }

    createManualDimension(start, end, index) {
        const COLOR = 0x00cbd6;
        const distance = start.distanceTo(end);
        const scale = this.currentScale || 1;

        const container = new THREE.Group();
        container.name = "MANUAL_DIMENSION_" + index;
        this.manualGroup.add(container);

        this.addPoint(start, COLOR, container, 2 * scale);
        this.addPoint(end, COLOR, container, 2 * scale);
        this.addDimension(start, end, COLOR, container, 7 * scale);

        const midpoint = start.clone().lerp(end, 0.5);
        midpoint.z += (10 * scale);
        midpoint.y -= (8 * scale);
        this.addLabel("DETAIL " + index, distance.toFixed(2) + " mm", midpoint, COLOR, container, 68 * scale, 21 * scale);
        return distance;
    }
}