import { container, handleFacts } from "@kodama/api";

export default {
  async fetch(request: Request): Promise<Response> {
    const c = container();
    return handleFacts(request, { fetcher: c.fetcher, today: c.today });
  },
};
