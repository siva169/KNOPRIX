export default function BrandWordmark({ compact = false }) {
  const markSize = compact ? 'h-12 w-12 sm:h-14 sm:w-14' : 'h-14 w-14 sm:h-20 sm:w-20 md:h-24 md:w-24';
  const wordSize = compact ? 'text-3xl sm:text-4xl' : 'text-[2.3rem] sm:text-[3.8rem] md:text-[4.6rem]';

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-4">
      <img
        src="/knoprix-mark.svg"
        alt="Knoprix"
        className={`${markSize} select-none object-contain shrink-0`}
      />

      <div
        className={`${wordSize} font-medium`}
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          letterSpacing: '-0.08em',
          lineHeight: 0.9,
          color: '#e9c877',
          textShadow: '0 0 18px rgba(233,200,119,0.2)',
        }}
      >
        Knoprix
      </div>
    </div>
  );
}
