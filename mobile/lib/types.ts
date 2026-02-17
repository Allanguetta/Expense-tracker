export type DashboardSummary = {
  cashflow: {
    inflow: number;
    outflow: number;
    net: number;
  };
  spend_by_category: {
    category_id: number | null;
    category_name: string | null;
    total_spent: number;
  }[];
  net_worth: {
    accounts_total: number;
    debts_total: number;
    crypto_total: number;
    net_worth: number;
    currency: string;
  };
  budgets: {
    id: number;
    name: string;
    month: string;
    currency: string;
    items: {
      category_id: number;
      limit_amount: number;
      spent: number;
    }[];
  }[];
  upcoming_recurring: {
    id: number;
    name: string;
    amount: number;
    currency: string;
    kind: 'expense' | 'income';
    frequency: 'weekly' | 'monthly';
    next_due_date: string;
    days_until_due: number;
  }[];
};

export type Account = {
  id: number;
  name: string;
  account_type: string;
  currency: string;
  balance: number | null;
  is_manual: boolean;
};

export type Category = {
  id: number;
  name: string;
  kind: string;
  is_system: boolean;
  color?: string | null;
};

export type Debt = {
  id: number;
  name: string;
  currency: string;
  balance: number;
  interest_rate: number | null;
  min_payment: number | null;
  due_day: number | null;
};

export type DebtPayoff = {
  months_to_payoff: number | null;
  total_interest_paid: number;
  monthly_payment: number | null;
};

export type UserProfile = {
  id: number;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: number;
  account_id: number;
  category_id?: number | null;
  note?: string | null;
  is_manual?: boolean;
  description: string;
  currency: string;
  amount: number;
  occurred_at: string;
};

export type Budget = {
  id: number;
  name: string;
  month: string;
  currency: string;
  items: {
    id: number;
    category_id: number;
    limit_amount: number;
  }[];
};

export type CryptoHolding = {
  id: number;
  user_id: number;
  symbol: string;
  name: string;
  quantity: number;
  cost_basis?: number | null;
  buy_price?: number | null;
  source: string;
  current_price?: number | null;
  current_value?: number | null;
  cost_value?: number | null;
  gain_loss?: number | null;
  gain_loss_pct?: number | null;
  currency?: string;
};

export type CryptoSymbol = {
  id: number;
  symbol: string;
  coingecko_id: string;
  created_at: string;
  updated_at: string;
};

export type PriceCache = {
  id: number;
  symbol: string;
  currency: string;
  price: number;
};

export type RecurringPayment = {
  id: number;
  user_id: number;
  account_id: number;
  category_id?: number | null;
  name: string;
  note?: string | null;
  currency: string;
  amount: number;
  kind: 'expense' | 'income';
  frequency: 'weekly' | 'monthly';
  interval: number;
  next_due_date: string;
  is_active: boolean;
  days_until_due?: number | null;
  created_at: string;
  updated_at: string;
};
