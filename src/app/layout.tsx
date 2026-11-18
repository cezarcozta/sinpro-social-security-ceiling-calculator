import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calculadora de Teto Previdenciário — Sinpro-ABC",
  description:
    "Leia seu extrato CNIS no próprio navegador e descubra em quais meses a contribuição ao INSS passou do teto.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
