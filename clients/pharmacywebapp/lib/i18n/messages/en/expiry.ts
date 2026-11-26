/** Stock › Expiry: one page for stock that is about to expire, has expired, or is being claimed back from suppliers. */
export const expiry = {
  title: "Expiry",
  description: "Everything about expiring stock in one place: sell it in time, write off what you'll destroy, or claim it from the supplier.",
  tabs: {
    expiring: "Expiring soon",
    expired: "Expired",
    claims: "Supplier claims",
  },
  hints: {
    expiring: "Expiring soon: stock that is still sellable. Sell it first, or claim it from the supplier before it expires.",
    expired: "Expired: write off stock you'll destroy. Recalled lots are listed here too.",
    claims: "Supplier claims: ask the supplier to credit or replace expired or near-expiry stock.",
  },
  noAccess: "You don't have access to any expiry list. Ask an administrator for inventory reports or supplier returns access.",
}

export type ExpiryMessages = typeof expiry
