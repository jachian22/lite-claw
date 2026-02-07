import { getEnv } from "../config/env.js";

type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

interface OpenWeatherForecastItem {
  dt_txt: string;
  main: {
    temp: number;
  };
  weather: Array<{ description: string }>;
}

interface OpenWeatherResponse {
  list: OpenWeatherForecastItem[];
  city?: { name?: string };
}

export class OpenWeatherClient {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async forecast(location: string, days: number): Promise<string> {
    const env = getEnv();
    if (!env.OPENWEATHER_API_KEY) {
      throw new Error("OpenWeather not configured");
    }

    const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
    url.searchParams.set("q", location);
    url.searchParams.set("appid", env.OPENWEATHER_API_KEY);
    url.searchParams.set("units", "imperial");

    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new Error(`OpenWeather request failed (${response.status})`);
    }

    const data = (await response.json()) as OpenWeatherResponse;
    const items = data.list.slice(0, Math.max(1, days) * 8);

    if (items.length === 0) {
      return `No forecast available for ${location}.`;
    }

    const summary = items
      .filter((item, index) => index % 8 === 0)
      .slice(0, days)
      .map((item) => {
        const desc = item.weather[0]?.description ?? "conditions unavailable";
        return `${item.dt_txt.split(" ")[0]}: ${Math.round(item.main.temp)}F, ${desc}`;
      });

    return [`Forecast for ${data.city?.name ?? location}:`, ...summary].join("\n");
  }
}
