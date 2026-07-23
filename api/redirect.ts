import { handleUserRedirect } from "@kodama/api";

export default {
  fetch(request: Request): Response {
    return handleUserRedirect(request);
  },
};
