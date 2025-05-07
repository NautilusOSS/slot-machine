import typing
from algopy import (
    Global,
    Txn,
    arc4,
    subroutine,
    UInt64,
    BoxMap,
    op,
    Bytes,
    itxn,
    urange,
    Account,
)
from opensubmarine import Upgradeable
from opensubmarine.utils.algorand import require_payment

# TODO migrate to opensubmarine.utils.types
Bytes32: typing.TypeAlias = arc4.StaticArray[arc4.Byte, typing.Literal[32]]
Bytes56: typing.TypeAlias = arc4.StaticArray[arc4.Byte, typing.Literal[56]]


# Storage


class Bet(arc4.Struct):
    who: arc4.Address
    amount: arc4.UInt64
    confirmed_round: arc4.UInt64
    index: arc4.UInt64
    claim_round: arc4.UInt64


# Events


class BetPlaced(arc4.Struct):
    who: arc4.Address
    amount: arc4.UInt64
    confirmed_round: arc4.UInt64
    index: arc4.UInt64
    claim_round: arc4.UInt64


class BetClaimed(arc4.Struct):
    who: arc4.Address
    amount: arc4.UInt64
    confirmed_round: arc4.UInt64
    index: arc4.UInt64
    claim_round: arc4.UInt64
    payout: arc4.UInt64


# Constants

BOX_COST_BET = 37700
MAX_RANDOM_NUMBER = 100000000
MAX_EXTRA_PAYMENT = 1000000000000000000
MAX_CLAIM_ROUND_DELTA = 1000
MAX_PAYOUT_MULTIPLIER = 100
ROUND_FUTURE_DELTA = 1
MIN_BET_AMOUNT = 1000000
CONTRACT_VERSION = 0
DEPLOYMENT_VERSION = 0


class SlotMachine(Upgradeable):
    """
    A simple slot machine smart contract
    """

    def __init__(self) -> None:
        # ownable state
        self.owner = Global.creator_address  # set owner to creator
        # upgradable state
        self.contract_version = UInt64(CONTRACT_VERSION)
        self.deployment_version = UInt64(DEPLOYMENT_VERSION)
        self.updatable = bool(1)
        self.upgrader = Global.creator_address
        # slot machine state
        self.balance_total = UInt64()
        self.balance_available = UInt64()
        self.balance_locked = UInt64()
        self.bet = BoxMap(Bytes, Bet, key_prefix="")
        # Define base and max house edge
        self.base_house_edge_bps = UInt64(7000)  # 70% base edge (default 56.41%)
        self.max_house_edge_bps = UInt64(9000)  # 90% maximum edge
        self.min_house_edge_bps = UInt64(1000)  # 10% minimum edge
        self.min_bet_amount = UInt64(1000000)  # 1 VOI

    # owner deposit
    # owner withdraw
    # owner set house edge
    # owner set min bet amount
    # owner set max bet amount

    # player bet
    # player claim

    @arc4.abimethod
    def post_upgrade(self) -> None:
        """
        Called after upgrade
        """
        self.contract_version = UInt64(CONTRACT_VERSION)
        self.deployment_version = UInt64(DEPLOYMENT_VERSION)

    @subroutine
    def only_owner(self) -> None:
        """
        Only callable by contract owner
        """
        assert Txn.sender == self.owner, "only owner can call this function"

    @arc4.abimethod(readonly=True)
    def get_block_seed(self, round: arc4.UInt64) -> Bytes32:
        return Bytes32.from_bytes(self._get_block_seed(round.native))

    @subroutine
    def _get_block_seed(self, round: UInt64) -> Bytes:
        return op.Block.blk_seed(round)[-32:]

    @arc4.abimethod
    def deposit(self) -> None:
        """
        Deposit funds into the contract
        """
        payment = require_payment(Txn.sender)
        assert payment > 0, "payment must be greater than 0"
        self.balance_total += payment
        self.balance_available += payment

    @arc4.abimethod
    def withdraw(self, amount: arc4.UInt64) -> None:
        """
        Withdraw funds from the contract
        Only callable by contract owner

        Args:
            amount: The amount of funds to withdraw in atomic units
        """
        self.only_owner()
        assert amount.native > UInt64(0), "amount must be greater than 0"
        assert amount.native <= self.balance_available, "insufficient balance"
        itxn.Payment(receiver=Txn.sender, amount=amount.native).submit()
        self.balance_available -= amount.native
        self.balance_total -= amount.native

    @arc4.abimethod
    def get_bet_key(
        self,
        address: arc4.Address,
        amount: arc4.UInt64,
        round: arc4.UInt64,
        index: arc4.UInt64,
    ) -> Bytes56:
        return Bytes56.from_bytes(
            self._get_bet_key(address.native, amount.native, round.native, index.native)
        )

    @subroutine
    def _get_bet_key(
        self, address: Account, amount: UInt64, round: UInt64, index: UInt64
    ) -> Bytes:
        return (
            arc4.Address(address).bytes
            + arc4.UInt64(amount).bytes
            + arc4.UInt64(round).bytes
            + arc4.UInt64(index).bytes
        )

    @subroutine
    def _get_dynamic_house_edge(self, bet_amount: UInt64) -> UInt64:
        """
        Calculate dynamic house edge based on contract balance and bet amount
        Returns house edge in basis points (1-10000)
        """
        # Use balance_available instead of total contract balance
        contract_balance = self.balance_available

        # Return maximum house edge if contract balance is too low
        if contract_balance <= bet_amount:
            return self.max_house_edge_bps

        # Calculate risk ratio (bet amount as percentage of balance, in basis points)
        risk_ratio = (bet_amount * UInt64(10000)) // contract_balance

        # Start with base house edge
        dynamic_edge = self.base_house_edge_bps

        # If bet is small relative to a healthy balance, decrease house edge
        # if risk_ratio < UInt64(100):  # If bet is less than 1% of balance
        #     # Decrease edge by up to 20% of base edge when contract is very healthy
        #     max_reduction = self.base_house_edge_bps // UInt64(5)
        #     edge_reduction = (UInt64(100) - risk_ratio) * max_reduction // UInt64(100)
        #     dynamic_edge -= edge_reduction
        # If bet is large relative to balance, increase house edge
        if risk_ratio > UInt64(1000):  # If bet is more than 10% of balance
            edge_increase = (risk_ratio - UInt64(1000)) // UInt64(100)
            dynamic_edge += edge_increase

        # Ensure house edge stays within bounds
        dynamic_edge = self.min(dynamic_edge, self.max_house_edge_bps)
        dynamic_edge = self.max(dynamic_edge, self.min_house_edge_bps)

        return dynamic_edge

    @subroutine
    def _calculate_bet_payout(
        self, bet_amount: UInt64, r: UInt64, house_edge_bps: UInt64
    ) -> UInt64:
        """
        Calculate the payout for a bet using dynamic house edge
        """
        assert r < MAX_RANDOM_NUMBER, "random number too large"

        # Use dynamic house edge instead of fixed
        house_edge_bps = self._get_dynamic_house_edge(bet_amount)
        scaling_factor = UInt64(10000) - house_edge_bps

        # Walk through each payout option with scaled probabilities
        # Base probabilities that tuple[, UInt64]would give 100% return (no house edge)
        # fair_payouts = [
        #     (100, 1000000),  # 1% chance for 100x
        #     (50, 2000000),  # 2% chance for 50x
        #     (20, 5000000),  # 5% chance for 20x
        #     (10, 10000000),  # 10% chance for 10x
        #     (5, 20000000),  # 20% chance for 5x
        #     (2, 62000000),  # 62% chance for 2x
        # ]
        # for multiplier, base_prob in fair_payouts:
        #     scaled_prob = (base_prob * scaling_factor) // UInt64(10000)
        #     if r < scaled_prob:
        #         return bet_amount * multiplier
        #     r -= scaled_prob
        multipliers = arc4.StaticArray(
            arc4.UInt64(100),
            arc4.UInt64(50),
            arc4.UInt64(20),
            arc4.UInt64(10),
            arc4.UInt64(5),
            arc4.UInt64(2),
        )
        probabilities = arc4.StaticArray(
            arc4.UInt64(1000000),
            arc4.UInt64(2000000),
            arc4.UInt64(5000000),
            arc4.UInt64(10000000),
            arc4.UInt64(20000000),
            arc4.UInt64(62000000),
        )
        for index in urange(6):
            multiplier = multipliers[index].native
            base_prob = probabilities[index].native
            scaled_prob = (base_prob * scaling_factor) // UInt64(10000)
            if r < scaled_prob:
                return bet_amount * multiplier
            r -= scaled_prob

        # If r remains after all payouts, it's a lose
        return UInt64(0)

    @arc4.abimethod
    def get_max_bet(self) -> arc4.UInt64:
        """
        Get the maximum bet amount
        """
        return arc4.UInt64(self._get_max_bet())

    @subroutine
    def _get_max_bet(self) -> UInt64:
        """
        Calculate maximum bet based on available balance and max payout multiplier
        Returns the maximum allowed bet in atomic units
        """
        # Max bet = available balance / max payout (100x)
        return self.balance_available // UInt64(100)

    @arc4.abimethod
    def spin(
        self,
        bet_amount: arc4.UInt64,
        index: arc4.UInt64,
        future_round_offset: arc4.UInt64,
    ) -> Bytes56:
        """
        Spin the slot machine. Outcome is determined by the seed
        of future round.

        Args:
            bet (uint): The player's wager.
            index (uint): Used to determine which 8 bytes of the block seed to use.

        Returns:
            r (uint): The round number of the spin.
        """
        return Bytes56.from_bytes(
            self._spin(bet_amount.native, index.native, future_round_offset.native)
        )

    @subroutine
    def _spin(
        self, bet_amount: UInt64, index: UInt64, future_round_offset: UInt64
    ) -> Bytes:
        """
        Spin the slot machine. Outcome is determined by the seed
        of future round.

        Args:
            bet (uint): The player's wager.

        Returns:
            r (uint): The round number of the spin.

        """
        assert index < UInt64(24), "index must be less than 24"
        assert bet_amount >= self.min_bet_amount, "bet amount too small"
        max_bet = self._get_max_bet()
        assert bet_amount <= max_bet, "bet amount too large"
        payment = require_payment(Txn.sender)
        assert payment >= bet_amount, "payment insufficient"
        extra_payment = payment - bet_amount
        assert (
            extra_payment >= BOX_COST_BET
        ), "extra payment must be greater than box cost"
        assert (
            extra_payment <= MAX_EXTRA_PAYMENT
        ), "extra payment must be less than max extra payment"

        # Update balance tracking
        self.balance_total += bet_amount
        self.balance_available += bet_amount  # Add bet amount to available first
        max_possible_payout = bet_amount * UInt64(MAX_PAYOUT_MULTIPLIER)
        self.balance_locked += max_possible_payout
        self.balance_available -= max_possible_payout

        round = Global.round
        bet_key = self._get_bet_key(Txn.sender, bet_amount, round, index)
        assert bet_key not in self.bet, "bet already exists"
        claim_round = round + ROUND_FUTURE_DELTA + future_round_offset
        self.bet[bet_key] = Bet(
            who=arc4.Address(Txn.sender),
            amount=arc4.UInt64(bet_amount),
            confirmed_round=arc4.UInt64(round),
            index=arc4.UInt64(index),
            claim_round=arc4.UInt64(claim_round),
        )
        arc4.emit(
            BetPlaced(
                who=arc4.Address(Txn.sender),
                amount=arc4.UInt64(bet_amount),
                confirmed_round=arc4.UInt64(round),
                index=arc4.UInt64(index),
                claim_round=arc4.UInt64(claim_round),
            )
        )
        return bet_key

    @arc4.abimethod
    def claim(self, bet_key: Bytes56) -> arc4.UInt64:
        """
        Claim a bet

        Args:
            bet_key: The key of the bet to claim

        Returns:
            payout: The payout for the bet
        """
        return arc4.UInt64(self._claim(bet_key.bytes))

    @subroutine
    def _claim(self, bet_key: Bytes) -> UInt64:
        """
        Claim a bet
        Args:
            bet_key: The key of the bet to claim

        Returns:
            payout: The payout for the bet
        """
        assert bet_key in self.bet, "bet not found"
        bet = self.bet[bet_key].copy()
        # if round is greater than claim_round + MAX_CLAIM_ROUND_DELTA, the bet is expired
        # and we can return the box cost to the sender
        if Global.round > bet.claim_round.native + UInt64(MAX_CLAIM_ROUND_DELTA):
            del self.bet[bet_key]
            # Release locked balance when bet expires
            max_possible_payout = bet.amount.native * UInt64(MAX_PAYOUT_MULTIPLIER)
            self.balance_locked -= max_possible_payout
            self.balance_available += max_possible_payout

            itxn.Payment(receiver=Txn.sender, amount=BOX_COST_BET).submit()
            arc4.emit(
                BetClaimed(
                    who=bet.who,
                    amount=bet.amount,
                    confirmed_round=bet.confirmed_round,
                    index=bet.index,
                    claim_round=bet.claim_round,
                    payout=arc4.UInt64(0),
                )
            )
            return UInt64(0)
        # if round is less than claim_round + 1000, the bet is still active
        # and we need to calculate the payout
        else:
            # Calculate start position based on index (each slice is 8 bytes)
            start_pos = bet.index.native
            r = (
                arc4.UInt64.from_bytes(
                    self._get_block_seed(bet.claim_round.native)[
                        start_pos : start_pos + UInt64(8)
                    ]
                ).native
                % MAX_RANDOM_NUMBER
            )
            payout = self._calculate_bet_payout(
                bet.amount.native, r, self.base_house_edge_bps
            )
            # Release locked balance and adjust available balance
            max_possible_payout = bet.amount.native * UInt64(MAX_PAYOUT_MULTIPLIER)
            self.balance_locked -= max_possible_payout
            self.balance_available += (
                max_possible_payout - payout
            )  # Release locked funds minus payout
            self.balance_total -= payout  # Reduce total balance by payout amount

            if payout > 0:
                itxn.Payment(receiver=bet.who.native, amount=payout).submit()
            del self.bet[bet_key]
            itxn.Payment(receiver=Txn.sender, amount=BOX_COST_BET).submit()
            arc4.emit(
                BetClaimed(
                    who=bet.who,
                    amount=bet.amount,
                    confirmed_round=bet.confirmed_round,
                    index=bet.index,
                    claim_round=bet.claim_round,
                    payout=arc4.UInt64(payout),
                )
            )
            return payout

    @subroutine
    def min(self, a: UInt64, b: UInt64) -> UInt64:
        return a if a < b else b

    @subroutine
    def max(self, a: UInt64, b: UInt64) -> UInt64:
        return a if a > b else b
