import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { PlayerState } from '../engine/types';
import { ARENA_RADIUS } from '../engine/physics';

interface Arena3DProps {
  players: Record<string, PlayerState>;
  localPlayerId: string;
}

export const Arena3D: React.FC<Arena3DProps> = ({ players, localPlayerId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playersRef = useRef(players);
  playersRef.current = players;
  const localPlayerIdRef = useRef(localPlayerId);
  localPlayerIdRef.current = localPlayerId;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#38bdf8'); // Sky blue
    scene.fog = new THREE.FogExp2('#38bdf8', 0.015);

    // 2. Camera setup
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 1000);
    camera.position.set(0, 18, 17);
    camera.lookAt(0, 0, 0);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.85);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight('#fffbeb', 1.4);
    sunLight.position.set(16, 28, 14);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 70;
    sunLight.shadow.camera.left = -ARENA_RADIUS - 4;
    sunLight.shadow.camera.right = ARENA_RADIUS + 4;
    sunLight.shadow.camera.top = ARENA_RADIUS + 4;
    sunLight.shadow.camera.bottom = -ARENA_RADIUS - 4;
    scene.add(sunLight);

    // Subtle upward bounce light
    const bounceLight = new THREE.DirectionalLight('#6ee7b7', 0.35);
    bounceLight.position.set(0, -10, 0);
    scene.add(bounceLight);

    // 5. Floating Island Meshes
    const islandGroup = new THREE.Group();

    // Grass platform
    const platformGeo = new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 1.4, 48);
    const grassMat = new THREE.MeshLambertMaterial({ color: '#22c55e' });
    const platformMesh = new THREE.Mesh(platformGeo, grassMat);
    platformMesh.position.y = -0.7;
    platformMesh.receiveShadow = true;
    islandGroup.add(platformMesh);

    // Island stone border rim
    const rimGeo = new THREE.TorusGeometry(ARENA_RADIUS, 0.35, 12, 48);
    rimGeo.rotateX(Math.PI / 2);
    const rimMat = new THREE.MeshLambertMaterial({ color: '#b45309' });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.y = 0.05;
    islandGroup.add(rimMesh);

    // Danger zone warning circle (Radius 9.8)
    const dangerGeo = new THREE.RingGeometry(9.6, 9.8, 48);
    dangerGeo.rotateX(-Math.PI / 2);
    const dangerMat = new THREE.MeshBasicMaterial({
      color: '#dc2626',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const dangerMesh = new THREE.Mesh(dangerGeo, dangerMat);
    dangerMesh.position.y = 0.02;
    islandGroup.add(dangerMesh);

    // Center arena icon circle
    const centerCircleGeo = new THREE.CircleGeometry(2.2, 32);
    centerCircleGeo.rotateX(-Math.PI / 2);
    const centerMat = new THREE.MeshBasicMaterial({
      color: '#15803d',
      side: THREE.DoubleSide,
    });
    const centerMesh = new THREE.Mesh(centerCircleGeo, centerMat);
    centerMesh.position.y = 0.01;
    islandGroup.add(centerMesh);

    // Inverted rock cone bottom
    const rockGeo = new THREE.ConeGeometry(ARENA_RADIUS * 0.98, 7.5, 24);
    rockGeo.rotateX(Math.PI);
    const rockMat = new THREE.MeshLambertMaterial({ color: '#451a03' });
    const rockMesh = new THREE.Mesh(rockGeo, rockMat);
    rockMesh.position.y = -5.15;
    islandGroup.add(rockMesh);

    scene.add(islandGroup);

    // 6. Floating clouds
    const cloudsGroup = new THREE.Group();
    const cloudGeo = new THREE.DodecahedronGeometry(2.4, 1);
    const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const c = new THREE.Mesh(cloudGeo, cloudMat);
      c.position.set(Math.cos(angle) * 32, -2 + Math.sin(i) * 3, Math.sin(angle) * 32);
      c.scale.set(1.5, 0.7, 1.2);
      cloudsGroup.add(c);
    }
    scene.add(cloudsGroup);

    // 7. Player Mesh Cache
    interface PlayerMeshes {
      root: THREE.Group;
      body: THREE.Mesh;
      leftGlove: THREE.Mesh;
      rightGlove: THREE.Mesh;
      leftEye: THREE.Mesh;
      rightEye: THREE.Mesh;
      nameSprite: THREE.Sprite;
    }
    const playerMeshMap = new Map<string, PlayerMeshes>();

    // Shared geometries
    const bodyGeo = new THREE.CapsuleGeometry(0.65, 0.7, 12, 16);
    const gloveGeo = new THREE.SphereGeometry(0.3, 12, 12);
    const eyeWhiteGeo = new THREE.SphereGeometry(0.16, 10, 10);
    const pupilGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const pupilMat = new THREE.MeshBasicMaterial({ color: '#000000' });

    function createNameSprite(name: string, isLocal: boolean): THREE.Sprite {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = isLocal ? 'rgba(245, 158, 11, 0.88)' : 'rgba(28, 25, 23, 0.75)';
        ctx.roundRect(10, 8, 236, 48, 12);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name.slice(0, 12), 128, 33);
      }
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(2.4, 0.6, 1);
      sprite.position.y = 1.9;
      return sprite;
    }

    function spawnPlayerMesh(player: PlayerState): PlayerMeshes {
      const root = new THREE.Group();

      // Body
      const bodyMat = new THREE.MeshLambertMaterial({ color: player.color || '#3b82f6' });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.95;
      body.castShadow = true;
      body.receiveShadow = true;
      root.add(body);

      // Left eye
      const leftEyeGroup = new THREE.Group();
      const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
      leftPupil.position.z = 0.12;
      leftEyeGroup.add(leftEyeWhite);
      leftEyeGroup.add(leftPupil);
      leftEyeGroup.position.set(-0.25, 1.2, 0.55);
      root.add(leftEyeGroup);

      // Right eye
      const rightEyeGroup = new THREE.Group();
      const rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
      rightPupil.position.z = 0.12;
      rightEyeGroup.add(rightEyeWhite);
      rightEyeGroup.add(rightPupil);
      rightEyeGroup.position.set(0.25, 1.2, 0.55);
      root.add(rightEyeGroup);

      // Left Glove
      const gloveMat = new THREE.MeshLambertMaterial({ color: '#dc2626' });
      const leftGlove = new THREE.Mesh(gloveGeo, gloveMat);
      leftGlove.position.set(-0.75, 0.85, 0.4);
      leftGlove.castShadow = true;
      root.add(leftGlove);

      // Right Glove
      const rightGlove = new THREE.Mesh(gloveGeo, gloveMat);
      rightGlove.position.set(0.75, 0.85, 0.4);
      rightGlove.castShadow = true;
      root.add(rightGlove);

      // Name tag billboard
      const nameSprite = createNameSprite(player.name, player.id === localPlayerIdRef.current);
      root.add(nameSprite);

      scene.add(root);

      return {
        root,
        body,
        leftGlove,
        rightGlove,
        leftEye: leftEyeWhite,
        rightEye: rightEyeWhite,
        nameSprite,
      };
    }

    // 8. Animation & Render loop
    let animId = 0;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Slowly rotate clouds
      cloudsGroup.rotation.y = elapsed * 0.04;

      const currentPlayers = playersRef.current;
      const currentIds = Object.keys(currentPlayers);

      // Remove obsolete meshes
      for (const [id, meshes] of playerMeshMap.entries()) {
        if (!currentPlayers[id]) {
          scene.remove(meshes.root);
          meshes.nameSprite.material.map?.dispose();
          meshes.nameSprite.material.dispose();
          playerMeshMap.delete(id);
        }
      }

      // Update / Create meshes
      for (const id of currentIds) {
        const p = currentPlayers[id];
        let meshes = playerMeshMap.get(id);
        if (!meshes) {
          meshes = spawnPlayerMesh(p);
          playerMeshMap.set(id, meshes);
        }

        // Position & angle
        const targetY = p.isFalling ? p.fallY : 0;
        meshes.root.position.set(p.x, targetY, p.z);
        meshes.root.rotation.y = -p.angle + Math.PI / 2;

        // Slap animation
        if (p.isSlapping) {
          meshes.rightGlove.position.z = 1.35;
          meshes.rightGlove.position.x = 0.35;
          meshes.rightGlove.scale.set(1.4, 1.4, 1.4);
        } else {
          meshes.rightGlove.position.z = 0.4;
          meshes.rightGlove.position.x = 0.75;
          meshes.rightGlove.scale.set(1, 1, 1);
        }

        // Hit wobble / spin
        if (p.isHit) {
          meshes.body.rotation.z = Math.sin(elapsed * 40) * 0.4;
          meshes.body.rotation.x = -0.3;
        } else {
          meshes.body.rotation.z = 0;
          meshes.body.rotation.x = 0;
        }

        // Falling spin
        if (p.isFalling) {
          meshes.root.rotation.x += dt * 8;
          meshes.root.rotation.z += dt * 6;
          const shrink = Math.max(0.1, 1 + p.fallY * 0.05);
          meshes.root.scale.set(shrink, shrink, shrink);
        } else {
          meshes.root.scale.set(1, 1, 1);
        }

        // Walking bounce bobbing
        const speed = Math.hypot(p.vx, p.vz);
        if (speed > 0.5 && !p.isFalling) {
          meshes.body.position.y = 0.95 + Math.abs(Math.sin(elapsed * 12)) * 0.15;
        } else if (!p.isFalling) {
          meshes.body.position.y = 0.95;
        }
      }

      // 9. Camera Tracking
      const localP = currentPlayers[localPlayerIdRef.current];
      const curW = container ? container.clientWidth : width;
      const curH = container ? container.clientHeight : height;
      const isPortrait = curH > curW;

      if (localP && !localP.isFalling) {
        // Desktop is closer and more immersive 3rd-person brawler action; Mobile portrait is elevated to see full ring
        const camDistY = isPortrait ? 18.5 : 9.5;
        const camDistZ = isPortrait ? 16.0 : 11.5;

        const targetCamX = localP.x * (isPortrait ? 0.4 : 0.7);
        const targetCamY = camDistY;
        const targetCamZ = localP.z * (isPortrait ? 0.4 : 0.7) + camDistZ;

        camera.position.x += (targetCamX - camera.position.x) * 0.08;
        camera.position.y += (targetCamY - camera.position.y) * 0.08;
        camera.position.z += (targetCamZ - camera.position.z) * 0.08;
        camera.lookAt(localP.x * (isPortrait ? 0.4 : 0.85), 1.1, localP.z * (isPortrait ? 0.4 : 0.85));
      } else {
        // Fallback to center view
        camera.position.x += (0 - camera.position.x) * 0.05;
        camera.position.y += (isPortrait ? 20 : 12) - camera.position.y * 0.05;
        camera.position.z += (isPortrait ? 17 : 13) - camera.position.z * 0.05;
        camera.lookAt(0, 0, 0);
      }


      renderer.render(scene, camera);
    };

    animate();

    // 10. Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      platformGeo.dispose();
      grassMat.dispose();
      rimGeo.dispose();
      rimMat.dispose();
      dangerGeo.dispose();
      dangerMat.dispose();
      centerCircleGeo.dispose();
      centerMat.dispose();
      rockGeo.dispose();
      rockMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      bodyGeo.dispose();
      gloveGeo.dispose();
      eyeWhiteGeo.dispose();
      pupilGeo.dispose();
      eyeWhiteMat.dispose();
      pupilMat.dispose();
      for (const meshes of playerMeshMap.values()) {
        scene.remove(meshes.root);
        meshes.nameSprite.material.map?.dispose();
        meshes.nameSprite.material.dispose();
      }
      playerMeshMap.clear();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'hidden',
        touchAction: 'none',
      }}
    />
  );
};
