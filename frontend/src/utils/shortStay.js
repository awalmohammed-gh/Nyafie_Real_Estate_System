// Short stays: hotels, serviced apartments and any home rented by the night (the server decides which)
export const shortStayPath = (listingsPath) => `${listingsPath}?stay=1`;
export const isShortStaySearch = (params) => params.get("stay") === "1";
