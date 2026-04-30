export default function Footer() {
  return (
    <footer className="bg-[#010e24] w-full py-12 mt-20 border-t border-[#72dcff]/10">
      <div className="flex flex-col md:flex-row justify-between items-center px-12 gap-8 w-full max-w-screen-2xl mx-auto">
        <div className="font-body text-sm uppercase tracking-widest text-[#dbe6ff]/40">
          © 2026 精准高山实验室 (PRECISION ALPINE LABS). 保留所有权利。
        </div>
        <div className="flex flex-wrap justify-center gap-8 font-body text-sm uppercase tracking-widest">
          <a className="text-[#dbe6ff]/40 hover:text-[#72dcff] hover:underline decoration-[#72dcff] underline-offset-4 transition-opacity duration-200" href="#">技术支持</a>
          <a className="text-[#dbe6ff]/40 hover:text-[#72dcff] hover:underline decoration-[#72dcff] underline-offset-4 transition-opacity duration-200" href="#">隐私协议</a>
          <a className="text-[#dbe6ff]/40 hover:text-[#72dcff] hover:underline decoration-[#72dcff] underline-offset-4 transition-opacity duration-200" href="#">系统状态</a>
          <a className="text-[#dbe6ff]/40 hover:text-[#72dcff] hover:underline decoration-[#72dcff] underline-offset-4 transition-opacity duration-200" href="#">服务条款</a>
        </div>
      </div>
    </footer>
  );
}
