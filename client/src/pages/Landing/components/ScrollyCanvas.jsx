import { useEffect, useRef, useState } from "react";
import { useScroll, useTransform, motion } from "framer-motion";
import Overlay from "./Overlay";

const TOTAL_FRAMES = 121;
const FRAME_PREFIX = "/sequence/frame_";
const FRAME_SUFFIX = "_delay-0.066s.webp";

function getFramePath(index) {
  const paddedIndex = index.toString().padStart(3, "0");
  return `${FRAME_PREFIX}${paddedIndex}${FRAME_SUFFIX}`;
}

export default function ScrollyCanvas() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [images, setImages] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const frameIndex = useTransform(scrollYProgress, [0, 1], [0, TOTAL_FRAMES - 1]);

  useEffect(() => {
    const loadImages = async () => {
      const loadedImages = new Array(TOTAL_FRAMES);
      let loaded = 0;

      const loadFrame = (index) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.src = getFramePath(index);
          img.onload = () => {
            loadedImages[index] = img;
            loaded++;
            setLoadProgress(Math.round((loaded / TOTAL_FRAMES) * 100));
            resolve();
          };
          img.onerror = () => resolve();
        });
      };

      await loadFrame(0);
      setImages([...loadedImages]);
      setIsLoaded(true);

      const remainingFrames = Array.from({ length: TOTAL_FRAMES - 1 }, (_, i) => i + 1);
      await Promise.all(remainingFrames.map(loadFrame));
      setImages([...loadedImages]);
    };

    loadImages();
  }, []);

  useEffect(() => {
    if (!isLoaded || images.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const drawFrame = (index) => {
      const img = images[Math.round(index)];
      if (!img || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const imgAspect = img.width / img.height;
      const canvasAspect = canvas.width / canvas.height;

      let drawWidth, drawHeight, drawX, drawY;

      if (canvasAspect > imgAspect) {
        drawWidth = canvas.width;
        drawHeight = canvas.width / imgAspect;
        drawX = 0;
        drawY = (canvas.height - drawHeight) / 2;
      } else {
        drawHeight = canvas.height;
        drawWidth = canvas.height * imgAspect;
        drawX = (canvas.width - drawWidth) / 2;
        drawY = 0;
      }

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    };

    drawFrame(0);

    const unsubscribe = frameIndex.on("change", (latest) => {
      drawFrame(latest);
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      unsubscribe();
    };
  }, [isLoaded, images, frameIndex]);

  return (
    <div ref={containerRef} style={{ position: "relative", height: "500vh", background: "#121212" }}>
      <div style={{ position: "sticky", top: 0, height: "100vh", width: "100%", overflow: "hidden" }}>
        {!isLoaded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: "absolute", inset: 0, zIndex: 20,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              background: "#121212"
            }}
          >
            <div style={{ marginBottom: 24 }}>
              <div style={{ height: 4, width: 256, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <motion.div
                  style={{
                    height: "100%",
                    width: `${loadProgress}%`,
                    background: "linear-gradient(to right, #a855f7, #ec4899)"
                  }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </div>
            <p style={{ fontFamily: "monospace", fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
              Loading experience... {loadProgress}%
            </p>
          </motion.div>
        )}
        <canvas
          ref={canvasRef}
          style={{ height: "100%", width: "100%", display: isLoaded ? "block" : "none" }}
        />
        <Overlay scrollYProgress={scrollYProgress} />
      </div>
    </div>
  );
}
