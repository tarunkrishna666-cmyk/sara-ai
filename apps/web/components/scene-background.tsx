"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type SceneBackgroundProps = {
  intensity?: "calm" | "hero";
};

export function SceneBackground({ intensity = "calm" }: SceneBackgroundProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, intensity === "hero" ? 9 : 10);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.15 : 1.7));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.className = "scene-canvas";
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const primary = new THREE.Color("#7dd3fc");
    const secondary = new THREE.Color("#a78bfa");
    const accent = new THREE.Color("#34d399");

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: primary,
      metalness: 0.18,
      roughness: 0.16,
      transmission: 0.28,
      thickness: 0.8,
      transparent: true,
      opacity: 0.56,
      clearcoat: 0.75,
      clearcoatRoughness: 0.16,
      emissive: new THREE.Color("#075985"),
      emissiveIntensity: 0.18,
    });

    const lineMaterial = new THREE.MeshBasicMaterial({
      color: secondary,
      wireframe: true,
      transparent: true,
      opacity: 0.58,
    });

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.25, 2), glassMaterial);
    core.position.set(intensity === "hero" ? 4.35 : 4.6, intensity === "hero" ? 1.15 : 0.55, -1.4);
    group.add(core);

    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(2.55, 1), lineMaterial);
    wire.position.copy(core.position);
    group.add(wire);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.72,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.95, 0.012, 12, 140), ringMaterial);
    ring.position.copy(core.position);
    ring.rotation.x = Math.PI / 2.5;
    group.add(ring);

    const shardMaterial = new THREE.MeshPhysicalMaterial({
      color: "#c4b5fd",
      roughness: 0.22,
      metalness: 0.18,
      transparent: true,
      opacity: 0.48,
      clearcoat: 0.6,
      emissive: new THREE.Color("#4c1d95"),
      emissiveIntensity: 0.12,
    });

    const shards = Array.from({ length: 7 }, (_, index) => {
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.42 + index * 0.03, 0), shardMaterial);
      const side = index % 2 === 0 ? -1 : 1;
      shard.position.set(side * (1.55 + index * 0.62), -2.35 + (index % 4) * 1.28, -2.4 - index * 0.14);
      shard.rotation.set(index * 0.4, index * 0.32, index * 0.18);
      group.add(shard);
      return shard;
    });

    const particleCount = isMobile ? 55 : intensity === "hero" ? 180 : 120;
    const positions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 15;
      positions[index * 3 + 1] = (Math.random() - 0.5) * 9;
      positions[index * 3 + 2] = -3 - Math.random() * 7;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: "#bae6fd",
      size: 0.026,
      transparent: true,
      opacity: 0.84,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    scene.add(new THREE.AmbientLight("#dbeafe", 0.9));
    const key = new THREE.DirectionalLight("#ffffff", 2.3);
    key.position.set(3.5, 4.5, 5);
    scene.add(key);
    const rim = new THREE.PointLight("#67e8f9", 2.4, 20);
    rim.position.set(-4, -1, 4);
    scene.add(rim);

    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    if (!isMobile) window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("resize", onResize);

    let frameId = 0;
    const animate = () => {
      const time = performance.now() * 0.001;

      if (!prefersReducedMotion) {
        core.rotation.x = time * 0.14 + pointer.y * 0.08;
        core.rotation.y = time * 0.18 + pointer.x * 0.12;
        wire.rotation.x = -time * 0.1;
        wire.rotation.y = time * 0.16;
        ring.rotation.z = time * 0.18;
        particles.rotation.y = time * 0.015;
        shards.forEach((shard, index) => {
          shard.rotation.x += 0.002 + index * 0.0003;
          shard.rotation.y += 0.003;
          shard.position.y += Math.sin(time * 0.8 + index) * 0.0015;
        });
      }

      group.position.x = pointer.x * 0.18;
      group.position.y = -pointer.y * 0.12;
      renderer.render(scene, camera);
      if (!prefersReducedMotion && !document.hidden) {
        frameId = window.requestAnimationFrame(animate);
      }
    };
    animate();
    const onVisibilityChange = () => {
      if (!document.hidden && !prefersReducedMotion) {
        window.cancelAnimationFrame(frameId);
        frameId = window.requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      mount.removeChild(renderer.domElement);
      particleGeometry.dispose();
      particleMaterial.dispose();
      core.geometry.dispose();
      wire.geometry.dispose();
      ring.geometry.dispose();
      glassMaterial.dispose();
      lineMaterial.dispose();
      ringMaterial.dispose();
      shardMaterial.dispose();
      shards.forEach((shard) => shard.geometry.dispose());
      renderer.dispose();
    };
  }, [intensity]);

  return <div ref={mountRef} className="scene-background" />;
}
