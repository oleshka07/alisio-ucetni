import type { MetadataRoute } from "next";

// Indexovat jen přihlašovací stránku; vše ostatní je za přihlášením.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/login"], disallow: ["/"] },
  };
}
