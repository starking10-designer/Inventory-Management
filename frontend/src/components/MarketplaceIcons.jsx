import flipkartLogo from "../assets/flipkart_logo.png";
import myntraLogo from "../assets/myntra_logo.png";

export function FlipkartIcon({ className = "h-7 w-7" }) {
  return (
    <img
      src={flipkartLogo}
      alt="Flipkart"
      className={`${className} object-contain`}
    />
  );
}

export function MyntraIcon({ className = "h-7 w-7" }) {
  return (
    <img
      src={myntraLogo}
      alt="Myntra"
      className={`${className} object-contain`}
    />
  );
}

export function AmazonIcon({ className = "h-7 w-7" }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="12" fill="#131921" />
      {/* Amazon letter 'a' */}
      <text
        x="24"
        y="25"
        fill="#FFFFFF"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="800"
        fontSize="21"
        textAnchor="middle"
      >
        a
      </text>
      {/* Amazon Smile Arc */}
      <path
        d="M13 29.5C18 34.5 30 34.5 35 29"
        stroke="#FF9900"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M33 29L35.8 28.8L34.8 31.6"
        fill="#FF9900"
        stroke="#FF9900"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AjioIcon({ className = "h-7 w-7" }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="12" fill="#1E293B" />
      <text
        x="24"
        y="28"
        fill="#FFFFFF"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="13"
        letterSpacing="1.2"
        textAnchor="middle"
      >
        AJIO
      </text>
      <line x1="15" y1="33" x2="33" y2="33" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function MeeshoIcon({ className = "h-7 w-7" }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Meesho signature fuchsia / magenta gradient background */}
      <rect width="48" height="48" rx="12" fill="url(#meeshoGrad)" />
      
      {/* Meesho official signature styled 'm' icon glyph */}
      <path
        d="M15 31V21.5C15 19.01 17.01 17 19.5 17C21.99 17 24 19.01 24 21.5V31"
        stroke="#FFFFFF"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 21.5C24 19.01 26.01 17 28.5 17C30.99 17 33 19.01 33 21.5V31"
        stroke="#FFFFFF"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="15" cy="31" r="1.6" fill="#FFFFFF" />
      <circle cx="24" cy="31" r="1.6" fill="#FFFFFF" />
      <circle cx="33" cy="31" r="1.6" fill="#FFFFFF" />
      
      <defs>
        <linearGradient id="meeshoGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#800040" />
          <stop offset="0.6" stopColor="#9B1B59" />
          <stop offset="1" stopColor="#F43397" />
        </linearGradient>
      </defs>
    </svg>
  );
}
