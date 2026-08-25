"use client";

/* R3F animation loops intentionally mutate Three.js objects outside React. */
/* eslint-disable react-hooks/immutability, react/no-unknown-property */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useReducedMotion } from "motion/react";
import * as THREE from "three";

type ImageItem = string | { src: string; alt?: string };

export interface InfiniteGalleryProps {
  images: ImageItem[];
  speed?: number;
  zSpacing?: number;
  visibleCount?: number;
  className?: string;
  style?: React.CSSProperties;
}

const vertexShader = `
  uniform float scrollForce;
  uniform float time;
  uniform float hovered;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float distanceFromCenter = length(pos.xy);
    float curve = distanceFromCenter * distanceFromCenter * scrollForce * 0.12;
    float cloth = (sin(pos.x * 2.6 + time) + sin(pos.y * 3.1 - time * 0.8)) * abs(scrollForce) * 0.018;
    float hoverWave = sin(pos.x * 4.0 + time * 5.0) * smoothstep(-0.5, 0.5, pos.x) * hovered * 0.08;
    pos.z -= curve + cloth + hoverWave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D map;
  uniform float opacity;
  uniform float blurAmount;
  uniform vec2 texelSize;
  varying vec2 vUv;

  void main() {
    vec4 color = texture2D(map, vUv);
    if (blurAmount > 0.02) {
      vec4 blur = vec4(0.0);
      blur += texture2D(map, vUv + texelSize * vec2(-1.0, -1.0) * blurAmount);
      blur += texture2D(map, vUv + texelSize * vec2( 0.0, -1.0) * blurAmount) * 2.0;
      blur += texture2D(map, vUv + texelSize * vec2( 1.0, -1.0) * blurAmount);
      blur += texture2D(map, vUv + texelSize * vec2(-1.0,  0.0) * blurAmount) * 2.0;
      blur += texture2D(map, vUv) * 4.0;
      blur += texture2D(map, vUv + texelSize * vec2( 1.0,  0.0) * blurAmount) * 2.0;
      blur += texture2D(map, vUv + texelSize * vec2(-1.0,  1.0) * blurAmount);
      blur += texture2D(map, vUv + texelSize * vec2( 0.0,  1.0) * blurAmount) * 2.0;
      blur += texture2D(map, vUv + texelSize * vec2( 1.0,  1.0) * blurAmount);
      color = blur / 16.0;
    }
    gl_FragColor = vec4(color.rgb, color.a * opacity);
  }
`;

function GalleryPlane({
  index,
  count,
  textures,
  velocityRef,
  zSpacing,
  reduceMotion,
}: {
  index: number;
  count: number;
  textures: THREE.Texture[];
  velocityRef: React.MutableRefObject<number>;
  zSpacing: number;
  reduceMotion: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const positionRef = useRef(index / count);
  const imageIndexRef = useRef(index % textures.length);
  const hoveredRef = useRef(0);
  const offset = useMemo(() => {
    const angle = index * 2.399;
    const radius = 0.9 + (index % 4) * 0.42;
    return { x: Math.sin(angle) * radius * 1.75, y: Math.cos(angle * 1.17) * radius * 0.92 };
  }, [index]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      map: { value: textures[index % textures.length] },
      opacity: { value: 1 },
      blurAmount: { value: 0 },
      texelSize: { value: new THREE.Vector2(1 / 512, 1 / 512) },
      scrollForce: { value: 0 },
      time: { value: 0 },
      hovered: { value: 0 },
    },
    vertexShader,
    fragmentShader,
  }), [index, textures]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!reduceMotion) positionRef.current += velocityRef.current * delta * 0.12;
    while (positionRef.current >= 1) {
      positionRef.current -= 1;
      imageIndexRef.current = (imageIndexRef.current + count) % textures.length;
      material.uniforms.map.value = textures[imageIndexRef.current];
    }
    while (positionRef.current < 0) {
      positionRef.current += 1;
      imageIndexRef.current = (imageIndexRef.current - count + textures.length * 20) % textures.length;
      material.uniforms.map.value = textures[imageIndexRef.current];
    }

    const normalized = positionRef.current;
    const z = 3 - normalized * count * zSpacing;
    const fadeIn = THREE.MathUtils.smoothstep(normalized, 0.02, 0.12);
    const fadeOut = 1 - THREE.MathUtils.smoothstep(normalized, 0.78, 0.96);
    const opacity = Math.min(fadeIn, fadeOut);
    const blur = (1 - Math.min(1, opacity * 1.35)) * 3.5;
    const texture = textures[imageIndexRef.current];
    const image = texture.image as { width?: number; height?: number } | undefined;
    if (image?.width && image?.height) material.uniforms.texelSize.value.set(1 / image.width, 1 / image.height);
    const aspect = image?.width && image?.height ? image.width / image.height : 1;
    const baseHeight = 2.2;

    mesh.position.set(offset.x, offset.y, z);
    mesh.scale.set(baseHeight * Math.min(1.65, aspect), baseHeight / Math.max(0.8, aspect > 1 ? 1 : aspect), 1);
    material.uniforms.opacity.value = opacity;
    material.uniforms.blurAmount.value = blur;
    material.uniforms.scrollForce.value = reduceMotion ? 0 : THREE.MathUtils.clamp(velocityRef.current, -3, 3);
    material.uniforms.time.value = state.clock.elapsedTime;
    material.uniforms.hovered.value = THREE.MathUtils.lerp(material.uniforms.hovered.value, hoveredRef.current, 0.12);
  });

  return (
    <mesh
      ref={meshRef}
      material={material}
      onPointerEnter={() => { hoveredRef.current = 1; }}
      onPointerLeave={() => { hoveredRef.current = 0; }}
    >
      <planeGeometry args={[1, 1, 24, 24]} />
    </mesh>
  );
}

function GalleryScene({ images, speed, visibleCount, zSpacing, reduceMotion }: { images: { src: string; alt: string }[]; speed: number; visibleCount: number; zSpacing: number; reduceMotion: boolean }) {
  const textures = useTexture(images.map((image) => image.src)) as THREE.Texture[];
  const velocityRef = useRef(reduceMotion ? 0 : 0.3 * speed);
  const lastInteractionRef = useRef(0);
  const pointerYRef = useRef<number | null>(null);
  const { gl } = useThree();

  useEffect(() => {
    textures.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    });
  }, [gl, textures]);

  useEffect(() => {
    const canvas = gl.domElement;
    const interact = (amount: number) => {
      if (reduceMotion) return;
      velocityRef.current = THREE.MathUtils.clamp(velocityRef.current + amount * speed, -5, 5);
      lastInteractionRef.current = performance.now();
    };
    const onWheel = (event: WheelEvent) => { event.preventDefault(); interact(event.deltaY * 0.004); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      interact(["ArrowUp", "ArrowLeft"].includes(event.key) ? -0.8 : 0.8);
    };
    const onPointerDown = (event: PointerEvent) => { pointerYRef.current = event.clientY; canvas.setPointerCapture(event.pointerId); };
    const onPointerMove = (event: PointerEvent) => {
      if (pointerYRef.current === null) return;
      const delta = pointerYRef.current - event.clientY;
      pointerYRef.current = event.clientY;
      interact(delta * 0.012);
    };
    const onPointerUp = () => { pointerYRef.current = null; };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [gl, reduceMotion, speed]);

  useFrame((_, delta) => {
    if (reduceMotion) return;
    const idle = performance.now() - lastInteractionRef.current > 3000;
    const target = idle ? 0.3 * speed : 0;
    velocityRef.current = THREE.MathUtils.damp(velocityRef.current, target, idle ? 1.5 : 3.5, delta);
  });

  return (
    <>
      {Array.from({ length: visibleCount }, (_, index) => (
        <GalleryPlane
          key={index}
          index={index}
          count={visibleCount}
          textures={textures}
          velocityRef={velocityRef}
          zSpacing={zSpacing}
          reduceMotion={reduceMotion}
        />
      ))}
    </>
  );
}

function FallbackGallery({ images }: { images: { src: string; alt: string }[] }) {
  return (
    <div className="grid h-full grid-cols-2 gap-2 bg-[#0b2116] p-3 sm:grid-cols-4">
      {images.slice(0, 8).map((image) => <img key={image.src} src={image.src} alt={image.alt} className="h-full min-h-36 w-full object-cover" />)}
    </div>
  );
}

export default function InfiniteGallery({
  images,
  speed = 1,
  zSpacing = 3,
  visibleCount = 10,
  className = "h-screen w-full",
  style,
}: InfiniteGalleryProps) {
  const normalized = useMemo(() => images.map((image) => typeof image === "string" ? { src: image, alt: "" } : { src: image.src, alt: image.alt ?? "" }), [images]);
  const [webglSupported, setWebglSupported] = useState(true);
  const reduceMotion = Boolean(useReducedMotion());

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const canvas = document.createElement("canvas");
        setWebglSupported(Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")));
      } catch {
        setWebglSupported(false);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!webglSupported || reduceMotion) return <div className={className} style={style}><FallbackGallery images={normalized} /></div>;
  if (normalized.length === 0) return <div className={className} style={style} />;

  return (
    <div className={className} style={style}>
      <Canvas camera={{ position: [0, 0, 8], fov: 55, near: 0.1, far: 100 }} gl={{ antialias: true, alpha: false }} dpr={[1, 1.5]} style={{ touchAction: "none", background: "#0b2116" }}>
        <Suspense fallback={null}>
          <GalleryScene images={normalized} speed={speed} visibleCount={Math.max(4, Math.min(14, visibleCount))} zSpacing={zSpacing} reduceMotion={reduceMotion} />
        </Suspense>
      </Canvas>
    </div>
  );
}
