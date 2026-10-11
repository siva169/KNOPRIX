export default function BrandWordmark({ compact = false }) {
  const markSize = compact ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-28 w-28 sm:h-32 sm:w-32';

  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:gap-4">
      <img
        src="/knoprix-mark.svg"
        alt="Knoprix"
        className={`${markSize} select-none object-contain shrink-0`}
      />

      <div
        className={compact ? 'text-3xl sm:text-4xl' : 'text-[2.6rem] sm:text-[3.6rem] md:text-[4.3rem]'}
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          letterSpacing: '-0.08em',
          lineHeight: 1,
          color: '#e9c877',
          textShadow: '0 0 16px rgba(233,200,119,0.18)',
        }}
      >
        Knoprix
      </div>
    </div>
  );
}
