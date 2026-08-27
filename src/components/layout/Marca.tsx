import intralogLogoAsset from "@/assets/intralog-logo.png.asset.json";

export const APP_NOME = "Gestão Inteligente de Férias e Presença";
export const APP_SUBTITULO =
  "Planejamento de equipes, cobertura operacional e apoio à liderança";
export const UNIDADE_PADRAO = "Unidade Motores";

/**
 * Logotipo oficial Intralog.
 * Proporção original preservada (altura fixa, largura automática),
 * sem recortes, sem alteração de cor e com margem de segurança.
 */
export function LogoIntralog({
  className = "h-8",
  titulo = "Intralog — logotipo oficial",
}: {
  className?: string;
  titulo?: string;
}) {
  return (
    <img
      src={intralogLogoAsset.url}
      alt="Intralog"
      title={titulo}
      width={2048}
      height={561}
      className={`${className} w-auto shrink-0 object-contain p-0.5`}
    />
  );
}
