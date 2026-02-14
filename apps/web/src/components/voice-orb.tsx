"use client";

import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";

// ── Types ─────────────────────────────────────────────────────

export type OrbState = "idle" | "listening" | "speaking" | "processing";

interface VoiceOrbProps {
  state?: OrbState;
  audioData?: Float32Array | null;
  className?: string;
}

// ── State color/animation configs ─────────────────────────────

const STATE_CONFIG: Record<
  OrbState,
  { color: [number, number, number]; speed: number; displacement: number; glow: number }
> = {
  idle: { color: [0.3, 0.5, 1.0], speed: 0.3, displacement: 0.05, glow: 0.4 },
  listening: { color: [0.2, 0.9, 0.4], speed: 0.5, displacement: 0.1, glow: 0.6 },
  speaking: { color: [1.0, 0.7, 0.2], speed: 0.8, displacement: 0.25, glow: 0.8 },
  processing: { color: [0.6, 0.3, 1.0], speed: 1.5, displacement: 0.08, glow: 0.7 },
};

// ── GLSL Shaders ──────────────────────────────────────────────

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uDisplacement;
  uniform float uSpeed;
  uniform float uAudioLevel;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisp;

  // Simplex-style noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vNormal = normal;
    float noise = snoise(position * 2.0 + uTime * uSpeed);
    float audioDisp = uAudioLevel * 0.3;
    float disp = noise * (uDisplacement + audioDisp);
    vDisp = disp;
    vec3 newPosition = position + normal * disp;
    vPosition = newPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGlow;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisp;

  void main() {
    // Fresnel rim lighting
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);

    // Base color with displacement-based variation
    vec3 color = uColor + vDisp * 0.5;

    // Add glow
    color += fresnel * uColor * uGlow;

    // Subtle time-based shimmer
    float shimmer = sin(vPosition.x * 10.0 + uTime * 2.0) * 0.03;
    color += shimmer;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ── Component ─────────────────────────────────────────────────

export function VoiceOrb({
  state = "idle",
  audioData = null,
  className = "",
}: VoiceOrbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const frameRef = useRef<number>(0);
  const targetRef = useRef(STATE_CONFIG.idle);
  const currentRef = useRef({ ...STATE_CONFIG.idle });

  const initScene = useCallback((container: HTMLDivElement) => {
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 3;
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Geometry
    const geometry = new THREE.IcosahedronGeometry(1, 64);

    // Material
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Vector3(...STATE_CONFIG.idle.color) },
        uDisplacement: { value: STATE_CONFIG.idle.displacement },
        uSpeed: { value: STATE_CONFIG.idle.speed },
        uGlow: { value: STATE_CONFIG.idle.glow },
        uAudioLevel: { value: 0 },
      },
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    initScene(container);

    // Resize handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      rendererRef.current.setSize(w, h);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frameRef.current);
      if (rendererRef.current && container) {
        container.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, [initScene]);

  // Update target on state change
  useEffect(() => {
    targetRef.current = STATE_CONFIG[state];
  }, [state]);

  // Animation loop
  useEffect(() => {
    const clock = new THREE.Clock();

    function animate() {
      frameRef.current = requestAnimationFrame(animate);

      if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !materialRef.current || !meshRef.current) {
        return;
      }

      const elapsed = clock.getElapsedTime();
      const dt = Math.min(clock.getDelta(), 0.05);
      const lerpFactor = 1 - Math.pow(0.001, dt); // ~300ms ease

      // Interpolate current toward target
      const target = targetRef.current;
      const current = currentRef.current;
      current.color[0] += (target.color[0] - current.color[0]) * lerpFactor;
      current.color[1] += (target.color[1] - current.color[1]) * lerpFactor;
      current.color[2] += (target.color[2] - current.color[2]) * lerpFactor;
      current.speed += (target.speed - current.speed) * lerpFactor;
      current.displacement += (target.displacement - current.displacement) * lerpFactor;
      current.glow += (target.glow - current.glow) * lerpFactor;

      // Compute audio level from FFT data
      let audioLevel = 0;
      if (audioData && audioData.length > 0) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
          sum += Math.abs(audioData[i]);
        }
        audioLevel = sum / audioData.length;
      }

      // Update uniforms
      const u = materialRef.current.uniforms;
      u.uTime.value = elapsed;
      (u.uColor.value as THREE.Vector3).set(...current.color);
      u.uDisplacement.value = current.displacement;
      u.uSpeed.value = current.speed;
      u.uGlow.value = current.glow;
      u.uAudioLevel.value = audioLevel;

      // Slow rotation
      meshRef.current.rotation.y = elapsed * 0.1;
      meshRef.current.rotation.x = Math.sin(elapsed * 0.05) * 0.1;

      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }

    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [audioData]);

  return (
    <div
      ref={containerRef}
      className={`relative aspect-square w-full ${className}`}
    />
  );
}
