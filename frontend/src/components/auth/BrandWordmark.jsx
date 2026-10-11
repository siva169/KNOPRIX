export default function BrandWordmark({ compact = false }) {
  const markSize = compact ? 'h-12 w-12 sm:h-14 sm:w-14' : 'h-14 w-14 sm:h-20 sm:w-20 md:h-24 md:w-24';
  const wordSize = compact ? 'text-3xl sm:text-4xl' : 'text-[2.3rem] sm:text-[3.8rem] md:text-[4.6rem]';

  return (
    <div role="img" aria-label="Knoprix" className="flex items-center justify-center gap-3 sm:gap-4 md:gap-6">
      <img
        src="/knoprix-mark.svg"
        alt=""
        aria-hidden="true"
        className={`${markSize} select-none object-contain shrink-0`}
      />

      <span
        aria-hidden="true"
        className={`${wordSize} whitespace-nowrap font-medium`}
        style={{
          fontFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
          letterSpacing: '-0.045em',
          lineHeight: 0.9,
          color: '#e9c877',
          textShadow: '0 0 10px rgba(233,200,119,0.12)',
        }}
      >
        Knoprix
      </span>
    </div>
  );
}
