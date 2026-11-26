/** Dựng và vẽ mô hình 3D bằng three.js. Chỉ được tải khi người dùng bật chế độ 3D. */
import {
  BackSide,
  BufferGeometry,
  CircleGeometry,
  ColorManagement,
  CylinderGeometry,
  ConeGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  FrontSide,
  GreaterDepth,
  GridHelper,
  Group,
  HemisphereLight,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  type Material,
  type Side,
} from 'three';
import { circlePoint } from '../round';
import type { Frame, View } from '../scene';
import type { Vec3 } from '../vec';
import { cameraAxes, cameraDistance, type Face3, type Model3 } from './model3d';

export interface Look3 {
  /** Kính trong: nhìn xuyên được vào bên trong khối */
  glass: boolean;
  perspective: boolean;
  /** Mặt sàn và bóng đổ */
  floor: boolean;
}

const SEGMENTS = 96;
/** Màu của mặt chưa tô khi hình đã có mặt được tô, để mặt tô nổi bật */
const PLAIN = '#cbd5e1';

export interface Engine {
  canvas: HTMLCanvasElement;
  resize: (width: number, height: number) => void;
  /** Dựng lại các vật thể. `pixel`: độ dài trong không gian ứng với một điểm ảnh */
  build: (model: Model3, look: Look3, pixel: number, lineWidth: number) => void;
  render: (view: View, frame: Frame) => void;
  /** Vẽ lại ở độ phân giải cao, không có lưới sàn, rồi trao ngay khung vẽ cho `take` */
  snapshot: (view: View, frame: Frame, ratio: number, take: (canvas: HTMLCanvasElement) => void) => void;
  dispose: () => void;
}

function polygon(points: Vec3[]) {
  const positions: number[] = [];
  for (let i = 1; i < points.length - 1; i++) positions.push(...points[0], ...points[i], ...points[i + 1]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function faceGeometry({ shape }: Face3, { round }: Model3): BufferGeometry {
  if (shape.type === 'polygon') return polygon(shape.points);
  const { r, y0, y1, type } = round!;
  if (shape.type === 'sphere') return new SphereGeometry(r, SEGMENTS, SEGMENTS / 2);
  if (shape.type === 'cap') {
    return new CircleGeometry(r, SEGMENTS).rotateX(shape.up ? -Math.PI / 2 : Math.PI / 2).translate(0, shape.y, 0);
  }
  const side = type === 'tru' ? new CylinderGeometry(r, r, y1 - y0, SEGMENTS, 1, true) : new ConeGeometry(r, y1 - y0, SEGMENTS, 1, true);
  return side.translate(0, (y0 + y1) / 2, 0);
}

/** Ném lỗi nếu trình duyệt không dùng được đồ họa 3D */
export function createEngine(): Engine {
  // Màu được dùng đúng như mã màu đã chọn
  ColorManagement.enabled = false;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.add(new HemisphereLight('#ffffff', '#8a93a8', 0.82 * Math.PI));
  // Đèn phụ để phía khuất sáng không bị tối quá
  const fill = new DirectionalLight('#ffffff', 0.18 * Math.PI);
  fill.position.set(-6, 3, 4);
  scene.add(fill);
  const sun = new DirectionalLight('#ffffff', 0.65 * Math.PI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 4;
  scene.add(sun);

  const perspective = new PerspectiveCamera();
  const parallel = new OrthographicCamera();
  let group = new Group();
  let ground = new Group();
  let model: Model3 | null = null;
  let look: Look3 = { glass: true, perspective: true, floor: true };
  let size = { width: 1, height: 1 };
  // Vật thể cũ chỉ được hủy sau khi vẽ vật thể mới, để card đồ họa không phải dịch lại chương trình tô
  let stale: Group[] = [];

  const clear = (target: Group) => {
    scene.remove(target);
    target.traverse((object) => {
      if (object instanceof Mesh || object instanceof GridHelper) {
        object.geometry.dispose();
        for (const material of [object.material].flat() as Material[]) material.dispose();
      }
    });
  };

  const add = (target: Group, geometry: BufferGeometry, material: Material, order: number) => {
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = order;
    target.add(mesh);
    return mesh;
  };

  const build: Engine['build'] = (next, nextLook, pixel, lineWidth) => {
    model = next;
    look = nextLook;
    scene.remove(group, ground);
    stale.push(group, ground);
    group = new Group();
    ground = new Group();

    const painted = next.faces.some((f) => f.fill);
    for (const face of next.faces) {
      const geometry = faceGeometry(face, next);
      const color = face.fill ?? (painted ? PLAIN : next.color);
      const body = (side: Side, opacity: number, order: number) =>
        add(
          group,
          geometry,
          new MeshStandardMaterial({
            color,
            roughness: 0.35,
            metalness: 0.05,
            side,
            transparent: look.glass,
            opacity,
            // Mặt phía sau không che nét, để nét khuất chỉ tính theo mặt phía trước
            depthWrite: side === FrontSide,
            polygonOffset: true,
            polygonOffsetFactor: 2,
            polygonOffsetUnits: 2,
          }),
          order,
        );
      if (look.glass) {
        body(BackSide, face.fill ? 0.34 : 0.18, 1);
        body(FrontSide, face.fill ? 0.5 : painted ? 0.18 : 0.3, 2).castShadow = true;
      } else {
        body(FrontSide, 1, 2).castShadow = true;
      }
    }

    const radius = Math.max(0.6, lineWidth * 0.6) * pixel;
    const dash = lineWidth * 3.5 * pixel;
    const period = lineWidth * 6.5 * pixel;
    // Một khúc trụ dài 1 dùng chung cho mọi vạch đứt
    const stick = new CylinderGeometry(radius * 0.75, radius * 0.75, 1, 6, 1, true);
    const up = new Vector3(0, 1, 0);
    const materials = new Map<string, [MeshBasicMaterial, MeshBasicMaterial]>();
    const inks = (color: string) => {
      let pair = materials.get(color);
      if (!pair) {
        pair = [
          new MeshBasicMaterial({ color, transparent: true }),
          // Chỉ hiện ở chỗ bị che: vẽ thành nét đứt
          new MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthFunc: GreaterDepth, depthWrite: false }),
        ];
        materials.set(color, pair);
      }
      return pair;
    };
    const piece = (a: Vector3, b: Vector3, geometry: BufferGeometry, material: Material, order: number) => {
      const direction = b.clone().sub(a);
      const mesh = add(group, geometry, material, order);
      mesh.position.copy(a).addScaledVector(direction, 0.5);
      mesh.scale.y = direction.length();
      mesh.quaternion.setFromUnitVectors(up, direction.normalize());
    };

    for (const edge of next.edges) {
      const a = new Vector3(...edge.from);
      const b = new Vector3(...edge.to);
      const length = a.distanceTo(b);
      if (length < 1e-6) continue;
      const [solid, hidden] = inks(edge.color);
      piece(a, b, new CylinderGeometry(radius, radius, 1, 8, 1, true), solid, 3);
      const count = Math.min(200, Math.max(1, Math.round(length / period)));
      for (let i = 0; i < count; i++) {
        const start = a.clone().lerp(b, (i + 0.2) / count);
        const end = a.clone().lerp(b, Math.min(1, (i + 0.2) / count + dash / length));
        piece(start, end, stick, hidden, 4);
      }
    }
    for (const circle of next.circles) {
      const [solid, hidden] = inks(circle.color);
      add(group, new TorusGeometry(circle.r, radius, 8, SEGMENTS * 2).rotateX(Math.PI / 2).translate(...circle.center), solid, 3);
      const length = 2 * Math.PI * circle.r;
      const count = Math.min(240, Math.max(8, Math.round(length / period)));
      for (let i = 0; i < count; i++) {
        const at = (t: number) => new Vector3(...circlePoint(circle.center, circle.r, t));
        piece(at(i / count), at(i / count + Math.min(0.7 / count, dash / length)), stick, hidden, 4);
      }
    }
    const dot = new SphereGeometry(lineWidth * 1.8 * pixel, 16, 12);
    for (const point of next.points) {
      add(group, dot, new MeshBasicMaterial({ color: point.color, transparent: true, depthTest: false }), 5).position.set(...point.p);
    }

    if (look.floor) {
      const span = next.radius * 6;
      const floor = add(ground, new PlaneGeometry(span * 2, span * 2).rotateX(-Math.PI / 2), new ShadowMaterial({ opacity: 0.18, depthWrite: false }), 0);
      floor.position.y = next.floor - 0.002;
      floor.receiveShadow = true;
      const grid = new GridHelper(Math.ceil(span / 2) * 2, Math.ceil(span / 2) * 2, '#8890a0', '#8890a0');
      grid.material.transparent = true;
      grid.material.opacity = 0.22;
      grid.material.depthWrite = false;
      grid.position.y = next.floor - 0.001;
      grid.renderOrder = 0;
      ground.add(grid);
    }
    // Đèn và vùng đổ bóng theo cỡ khối
    const r = next.radius;
    sun.position.set(r, r * 2.4, r * 1.4);
    Object.assign(sun.shadow.camera, { left: -2 * r, right: 2 * r, top: 2 * r, bottom: -2 * r, near: 0.1, far: r * 7 });
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(ground, group);
  };

  const render: Engine['render'] = (view, frame) => {
    if (!model) return;
    const distance = cameraDistance(model);
    const halfHeight = size.height / 2 / frame.scale;
    const halfWidth = size.width / 2 / frame.scale;
    const camera = look.perspective ? perspective : parallel;
    if (look.perspective) {
      perspective.fov = (2 * Math.atan(halfHeight / distance) * 180) / Math.PI;
      perspective.aspect = size.width / size.height;
    } else {
      Object.assign(parallel, { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight });
    }
    camera.near = distance * 0.02;
    camera.far = distance * 8;
    camera.updateProjectionMatrix();
    const { toViewer } = cameraAxes(view);
    camera.position.set(toViewer[0] * distance, toViewer[1] * distance, toViewer[2] * distance);
    camera.lookAt(0, 0, 0);
    // Nhìn từ dưới mặt sàn thì ẩn sàn để không che khối
    ground.visible = camera.position.y > model.floor;
    renderer.render(scene, camera);
    stale.forEach(clear);
    stale = [];
  };

  const ratio = () => Math.min(2, window.devicePixelRatio || 1);

  return {
    canvas: renderer.domElement,
    resize: (width, height) => {
      size = { width: Math.max(1, width), height: Math.max(1, height) };
      renderer.setPixelRatio(ratio());
      renderer.setSize(size.width, size.height);
    },
    build,
    render,
    snapshot: (view, frame, scale, take) => {
      renderer.setPixelRatio(scale);
      const grids = ground.children.filter((child) => child instanceof GridHelper);
      grids.forEach((grid) => (grid.visible = false));
      render(view, frame);
      try {
        take(renderer.domElement);
      } finally {
        grids.forEach((grid) => (grid.visible = true));
        renderer.setPixelRatio(ratio());
        render(view, frame);
      }
    },
    dispose: () => {
      [...stale, group, ground].forEach(clear);
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
