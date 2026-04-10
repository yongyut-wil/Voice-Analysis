import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { reactClickToComponent } from "vite-plugin-react-click-to-component";

export default defineConfig(({ mode }) => {
  // Vite ไม่ inject non-VITE_ vars เข้า process.env อัตโนมัติ
  // ต้อง inject REACT_EDITOR เองเพื่อให้ launch-editor เปิด editor ได้
  const localEnv = loadEnv(mode, process.cwd(), "");
  if (localEnv.LAUNCH_EDITOR) {
    process.env.LAUNCH_EDITOR = localEnv.LAUNCH_EDITOR;
  }

  return {
    plugins: [tailwindcss(), reactRouter(), reactClickToComponent()],
    resolve: {
      tsconfigPaths: true,
    },
  };
});
