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
    OnCompleteAction,
    ARC4Contract,
    Application,
    BigUInt,
    String,
)
from opensubmarine import Ownable, Upgradeable, Stakeable, ARC200Token, arc200_Transfer
from opensubmarine.utils.algorand import require_payment, close_offline_on_delete

# TODO migrate to opensubmarine.utils.types

Bytes32: typing.TypeAlias = arc4.StaticArray[arc4.Byte, typing.Literal[32]]
Bytes56: typing.TypeAlias = arc4.StaticArray[arc4.Byte, typing.Literal[56]]

# TODO migrate to opensubmarine

# <https://github.com/VoiNetwork/smart-contract-staking/blob/next/src/contract.py#L342>

##################################################
# Deleteable
#   allows contract to be deleted
##################################################


class DeleteableInterface(ARC4Contract):
    """
    Interface for all abimethods of deletable contract.
    """

    def __init__(self) -> None:  # pragma: no cover
        self.deletable = bool(1)

    @arc4.abimethod
    def on_delete(self) -> None:  # pragma: no cover
        """
        Delete the contract.
        """
        pass


class Deleteable(DeleteableInterface):
    def __init__(self) -> None:  # pragma: no cover
        super().__init__()

    @arc4.baremethod(allow_actions=["DeleteApplication"])
    def on_delete(self) -> None:  # pragma: no cover
        ##########################################
        # WARNING: This app can be deleted by the creator (Development)
        ##########################################
        assert Txn.sender == Global.creator_address, "must be creator"
        assert self.deletable == UInt64(1), "not approved"
        ##########################################


class TouchableInterface(ARC4Contract):
    """
    A simple touchable contract
    """

    @arc4.abimethod
    def touch(self) -> None:
        """
        Touch the contract
        """
        pass


class Touchable(TouchableInterface):
    """
    A simple touchable contract
    """

    def __init__(self) -> None:
        pass


# REM Beacon mostly for testing but can be used for production
# especially when it comes to taking advantage of group resource
# sharing


class Beacon(Touchable, Upgradeable, Deleteable):
    """
    A simple beacon contract
    """

    def __init__(self) -> None:
        # ownable state
        self.owner = Global.creator_address
        # upgradable state
        self.upgrader = Global.creator_address
        self.contract_version = UInt64()
        self.deployment_version = UInt64()
        self.updatable = bool(1)
        # deleteable state
        self.deletable = bool(1)

    @arc4.abimethod
    def post_update(self) -> None:
        """
        Post update
        """
        assert Txn.sender == self.upgrader, "must be upgrader"

    @arc4.abimethod
    def nop(self) -> None:
        """
        No operation
        """
        pass


# Storage


class Bet(arc4.Struct):
    who: arc4.Address
    amount: arc4.UInt64
    confirmed_round: arc4.UInt64
    index: arc4.UInt64
    claim_round: arc4.UInt64


# Events


class Closed(arc4.Struct):
    who: arc4.Address
    close_remainder_to: arc4.Address


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

BOX_COST_BALANCE = 28500  # 28500 microVOI
BOX_COST_BET = 37700  # 37700 microVOI
MAX_RANDOM_NUMBER = 1000000000  # 1 billion
MAX_EXTRA_PAYMENT = 1000000  # 1 VOI
MAX_PAYOUT_MULTIPLIER = 100  # 100x
ROUND_FUTURE_DELTA = 1  # 1 round in the future
MAX_CLAIM_ROUND_DELTA = 1000  # 1000 rounds in the future
MIN_BET_AMOUNT = 1000000  # 1 VOI
MAX_BET_AMOUNT = 1000000000  # 1000 VOI
MIN_BANK_AMOUNT = 350000000000  # 350,000 VOI
SCALING_FACTOR = 10**12


class PayoutModel(arc4.Struct):
    multipliers: arc4.StaticArray[arc4.UInt64, typing.Literal[6]]
    probabilities: arc4.StaticArray[arc4.UInt64, typing.Literal[6]]


class ModelUpdated(arc4.Struct):
    old_model: PayoutModel
    new_model: PayoutModel


class SlotMachinePayoutModelInterface(ARC4Contract):
    """
    A simple slot machine payout model
    """

    @arc4.abimethod(readonly=True)
    def get_payout_model(self) -> PayoutModel:
        """
        Get the payout model
        """
        return self._initial_payout_model()

    @arc4.abimethod
    def set_payout_model(
        self,
        multipliers: arc4.StaticArray[arc4.UInt64, typing.Literal[6]],
        probabilities: arc4.StaticArray[arc4.UInt64, typing.Literal[6]],
    ) -> None:
        """
        Set the payout model
        """
        pass

    @arc4.abimethod
    def get_payout(self, bet_amount: arc4.UInt64, r: arc4.UInt64) -> arc4.UInt64:
        """
        Get the payout for a bet
        """
        return arc4.UInt64(self._calculate_bet_payout(bet_amount.native, r.native))

    @subroutine
    def _calculate_bet_payout(self, bet_amount: UInt64, r: UInt64) -> UInt64:
        """
        Simulate a single slot payout using weighted random thresholds.
        Random number r is in [0, 1_000_000_000). Uses if/then/else-style logic
        directly subtracting each probability from r until a match is found.
        """
        return UInt64(0)

    @subroutine
    def _initial_payout_model(self) -> PayoutModel:
        """
        Invalid payout model
        """
        return PayoutModel(
            multipliers=arc4.StaticArray(
                arc4.UInt64(0),
                arc4.UInt64(0),
                arc4.UInt64(0),
                arc4.UInt64(0),
                arc4.UInt64(0),
                arc4.UInt64(0),
            ),
            probabilities=arc4.StaticArray(
                arc4.UInt64(0),
                arc4.UInt64(0),
                arc4.UInt64(0),
                arc4.UInt64(0),
                arc4.UInt64(0),
                arc4.UInt64(0),
            ),
        )


class SlotMachinePayoutModel(SlotMachinePayoutModelInterface, Upgradeable, Deleteable):
    """
    A simple slot machine payout model
    """

    def __init__(self) -> None:
        # ownable state
        self.owner = Global.creator_address
        # upgradable state
        self.upgrader = Global.creator_address
        self.contract_version = UInt64()
        self.deployment_version = UInt64()
        self.updatable = bool(1)
        # deleteable state
        self.deletable = bool(1)
        # payout model state
        self.payout_model = self._initial_payout_model()

    @arc4.abimethod
    def post_update(self) -> None:
        """
        Post update
        """
        assert Txn.sender == self.upgrader, "must be upgrader"

    # guard methods

    @subroutine
    def only_owner(self) -> None:
        """
        Only callable by contract owner
        """
        assert Txn.sender == self.owner, "only owner can call this function"

    # setter methods

    @arc4.abimethod
    def set_payout_model(
        self,
        multipliers: arc4.StaticArray[arc4.UInt64, typing.Literal[6]],
        probabilities: arc4.StaticArray[arc4.UInt64, typing.Literal[6]],
    ) -> None:
        """
        Set the payout model
        """
        self.only_owner()
        self.payout_model = PayoutModel(
            multipliers=multipliers.copy(), probabilities=probabilities.copy()
        )
        arc4.emit(
            ModelUpdated(old_model=self.payout_model, new_model=self.payout_model)
        )

    # accessor methods

    @arc4.abimethod(readonly=True)
    def get_payout_model(self) -> PayoutModel:
        """
        Get the payout model
        """
        return self.payout_model

    # override
    @subroutine
    def _calculate_bet_payout(self, bet_amount: UInt64, r: UInt64) -> UInt64:
        """
        Simulate a single slot payout using weighted random thresholds.
        Random number r is in [0, 1_000_000_000). Uses if/then/else-style logic
        directly subtracting each probability from r until a match is found.
        """
        for index in urange(6):
            prob = self.payout_model.probabilities[index].native
            if r < prob:
                return bet_amount * self.payout_model.multipliers[index].native
            r -= prob

        return UInt64(0)


class SlotMachineInterface(ARC4Contract):
    """
    A simple slot machine smart contract
    """

    @arc4.abimethod
    def spin(
        self, bet_amount: arc4.UInt64, provider_id: arc4.UInt64, index: arc4.UInt64
    ) -> Bytes56:
        """
        Spin the slot machine. Outcome is determined by the seed
        of future round.

        Args:
            bet (uint): The player's wager.
            index (uint): Player's choice of index.

        Returns:
            r (uint): The round number of the spin.
        """
        return Bytes56.from_bytes(
            self._spin(bet_amount.native, provider_id.native, index.native)
        )

    @subroutine
    def _spin(self, bet_amount: UInt64, provider_id: UInt64, index: UInt64) -> Bytes:
        """
        Spin the slot machine. Outcome is determined by the seed
        of future round.

        Args:
            bet (uint): The player's wager.
            index (uint): Player's choice of index.

        Returns:
            r (uint): The round number of the spin.
        """
        return Bytes.from_base64(
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="
        )

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
        return UInt64(0)

    @arc4.abimethod(readonly=True)
    def get_balance_available(self) -> arc4.UInt64:
        """
        Get the available balance
        """
        return arc4.UInt64(0)

    @arc4.abimethod(readonly=True)
    def get_balance_locked(self) -> arc4.UInt64:
        """
        Get the locked balance
        """
        return arc4.UInt64(0)

    @arc4.abimethod(readonly=True)
    def get_balance_total(self) -> arc4.UInt64:
        """
        Get the total balance
        """
        return arc4.UInt64(0)


class SlotMachine(SlotMachineInterface, Ownable, Upgradeable, Stakeable, Deleteable):
    """
    A simple slot machine smart contract
    """

    def __init__(self) -> None:
        # ownable state
        self.owner = Global.creator_address  # set owner to creator
        # stakeable state
        self.delegate = Account()  # zero address
        self.stakeable = bool(1)  # 1 (Default unlocked)
        # upgradable state
        self.contract_version = UInt64()
        self.deployment_version = UInt64()
        self.updatable = bool(1)
        self.upgrader = Global.creator_address
        # deleteable state
        self.deletable = bool(1)
        # slot machine state
        self.balance_total = UInt64()
        self.balance_available = UInt64()
        self.balance_locked = UInt64()
        self.min_bet_amount = UInt64(MIN_BET_AMOUNT)  # 1 VOI
        self.max_bet_amount = UInt64(MAX_BET_AMOUNT)  # 1000 VOI
        self.min_bank_amount = UInt64(MIN_BANK_AMOUNT)  # 350,000 VOI
        self.payout_model = UInt64()  # app id of payout model
        self.bet = BoxMap(Bytes, Bet, key_prefix="")

    # guard methods

    @subroutine
    def only_owner(self) -> None:
        """
        Only callable by contract owner
        """
        assert Txn.sender == self.owner, "only owner can call this function"

    # upgradeable methods

    @arc4.abimethod
    def post_update(self) -> None:
        """
        Called after upgrade
        """
        assert Txn.sender == self.upgrader, "must be upgrader"

    # owner methods

    @arc4.abimethod
    def set_min_bank_amount(self, min_bank_amount: arc4.UInt64) -> None:
        """
        Set the minimum bank amount
        """
        self.only_owner()
        assert (
            min_bank_amount.native >= MIN_BANK_AMOUNT
        ), "min bank amount must be greater than 350,000 VOI"
        self.min_bank_amount = min_bank_amount.native

    @arc4.abimethod
    def set_payout_model(self, app_id: arc4.UInt64) -> None:
        """
        Set the payout model
        """
        self.only_owner()
        assert app_id.native > 0, "app id must be greater than 0"
        self.payout_model = app_id.native

    @arc4.abimethod
    def set_min_bet_amount(self, min_bet_amount: arc4.UInt64) -> None:
        """
        Set the minimum bet amount
        """
        self.only_owner()
        assert min_bet_amount.native > 0, "min bet amount must be greater than 0"
        assert (
            min_bet_amount.native <= self.max_bet_amount
        ), "min bet amount must be less than max bet amount"
        self.min_bet_amount = min_bet_amount.native

    @arc4.abimethod
    def set_max_bet_amount(self, max_bet_amount: arc4.UInt64) -> None:
        """
        Set the maximum bet amount
        """
        self.only_owner()
        assert max_bet_amount.native > 0, "max bet amount must be greater than 0"
        assert (
            max_bet_amount.native >= self.min_bet_amount
        ), "max bet amount must be greater than min bet amount"
        self.max_bet_amount = max_bet_amount.native

    @arc4.abimethod
    def burn_upgreadable_fuse(self) -> None:
        """
        Burn the upgradeable fuse
        """
        self.only_owner()
        self.updatable = False

    @arc4.abimethod
    def burn_stakeable_fuse(self) -> None:
        """
        Burn the stakeable fuse
        """
        self.only_owner()
        self.stakeable = False

    @arc4.abimethod
    def burn_deletable_fuse(self) -> None:
        """
        Burn the deletable fuse
        """
        self.only_owner()
        self.deletable = False

    @arc4.abimethod
    def owner_deposit(self, amount: arc4.UInt64) -> None:
        """
        Deposit funds into the contract
        """
        self.only_owner()
        self.balance_total += amount.native
        self.balance_available += amount.native

    @arc4.abimethod
    def get_owner(self) -> arc4.Address:
        """
        Get the owner of the contract
        """
        return arc4.Address(self.owner)

    # block seed utils

    @subroutine
    def _get_block_seed(self, round: UInt64) -> Bytes:
        return op.Block.blk_seed(round)[-32:]

    # bankroll management

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

    # balance methods

    @arc4.abimethod(readonly=True)
    def get_balance_available(self) -> arc4.UInt64:
        """
        Get the available balance
        """
        return arc4.UInt64(self.balance_available)

    @arc4.abimethod(readonly=True)
    def get_balance_locked(self) -> arc4.UInt64:
        """
        Get the locked balance
        """
        return arc4.UInt64(self.balance_locked)

    @arc4.abimethod(readonly=True)
    def get_balance_total(self) -> arc4.UInt64:
        """
        Get the total balance
        """
        return arc4.UInt64(self.balance_total)

    # embedded payout model

    @subroutine
    def _calculate_bet_payout(self, bet_amount: UInt64, r: UInt64) -> UInt64:
        """
        Simulate a single slot payout using weighted random thresholds.
        Random number r is in [0, 1_000_000_000). Uses if/then/else-style logic
        directly subtracting each probability from r until a match is found.
        """
        payout_model = PayoutModel(
            multipliers=arc4.StaticArray[arc4.UInt64, typing.Literal[6]](
                arc4.UInt64(100),
                arc4.UInt64(50),
                arc4.UInt64(20),
                arc4.UInt64(10),
                arc4.UInt64(5),
                arc4.UInt64(2),
            ),
            probabilities=arc4.StaticArray[arc4.UInt64, typing.Literal[6]](
                arc4.UInt64(82758),
                arc4.UInt64(1655172),
                arc4.UInt64(8275862),
                arc4.UInt64(16551724),
                arc4.UInt64(41379310),
                arc4.UInt64(165517241),
            ),
        )
        for index in urange(6):
            prob = payout_model.probabilities[index].native
            if r < prob:
                return bet_amount * payout_model.multipliers[index].native
            r -= prob

        return UInt64(0)

    # bet key utils

    @arc4.abimethod(readonly=True)
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

    # terminal methods

    @arc4.abimethod(allow_actions=[OnCompleteAction.DeleteApplication])
    def kill(self) -> None:
        """
        Kill the contract
        """
        assert Txn.sender == self.upgrader, "must be upgrader"
        assert self.updatable == UInt64(1), "not approved"
        assert self.deletable == UInt64(1), "not approved"
        assert self.balance_locked == UInt64(0), "balance locked must be 0"
        arc4.emit(Closed(arc4.Address(self.upgrader), arc4.Address(self.upgrader)))
        close_offline_on_delete(self.upgrader)

    # slot machine methods
    # override
    @subroutine
    def _spin(self, bet_amount: UInt64, provider_id: UInt64, index: UInt64) -> Bytes:
        """
        Spin the slot machine. Outcome is determined by the seed
        of future round.

        Args:
            bet (uint): The player's wager.
            index (uint): Player's choice of index.

        Returns:
            r (uint): The round number of the spin.
        """
        assert bet_amount >= self.min_bet_amount, "bet amount too small"
        assert bet_amount <= self.max_bet_amount, "bet amount too large"
        payment = require_payment(Txn.sender)
        assert payment >= bet_amount, "payment insufficient"
        extra_payment = payment - bet_amount
        assert (
            extra_payment >= BOX_COST_BET
        ), "extra payment must be greater than box cost"
        assert (
            extra_payment <= MAX_EXTRA_PAYMENT
        ), "extra payment must be less than max extra payment"
        # lock spin if balance total is less than min bank amount
        assert (
            self.balance_total >= self.min_bank_amount
        ), "balance total must be greater than min bank amount"
        # Update balance tracking
        #   Add bet amount to total balance
        self.balance_total += bet_amount
        self.balance_available += bet_amount  # Add bet amount to available first
        max_possible_payout = bet_amount * UInt64(MAX_PAYOUT_MULTIPLIER)
        self.balance_locked += max_possible_payout
        # prevent underflow, impossible because it would err with result would be negative but good to have
        assert (
            self.balance_available >= max_possible_payout
        ), "balance available must be greater than max possible payout"
        self.balance_available -= max_possible_payout
        # Create bet
        confirmed_round = Global.round
        bet_key = self._get_bet_key(Txn.sender, bet_amount, provider_id, index)
        assert bet_key not in self.bet, "bet already exists"
        claim_round = confirmed_round + ROUND_FUTURE_DELTA
        self.bet[bet_key] = Bet(
            who=arc4.Address(Txn.sender),
            amount=arc4.UInt64(bet_amount),
            confirmed_round=arc4.UInt64(confirmed_round),
            index=arc4.UInt64(index),
            claim_round=arc4.UInt64(claim_round),
        )
        arc4.emit(
            BetPlaced(
                who=arc4.Address(Txn.sender),
                amount=arc4.UInt64(bet_amount),
                confirmed_round=arc4.UInt64(confirmed_round),
                index=arc4.UInt64(index),
                claim_round=arc4.UInt64(claim_round),
            )
        )
        return bet_key

    # override
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
        if Global.round > bet.claim_round.native + MAX_CLAIM_ROUND_DELTA:
            del self.bet[bet_key]
            # Update balance tracking
            #   Release locked balance and adjust available balance
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
            # calculate r from block seed and bet key
            combined = self._get_block_seed(bet.claim_round.native) + bet_key
            hashed = op.sha256(combined)
            r = arc4.UInt64.from_bytes(
                arc4.UInt256(
                    arc4.UInt256.from_bytes(hashed).native % BigUInt(1_000_000_000)
                ).bytes[-8:]
            )
            #########################################################
            # get payout internal if subclass of SlotMachinePayoutModel
            # otherwise call model to get payout
            #########################################################
            # use embedded payout model
            payout = arc4.UInt64(
                self._calculate_bet_payout(bet.amount.native, r.native)
            )
            # use remote payout model
            # payout, txn = arc4.abi_call(
            #     SlotMachinePayoutModelInterface.get_payout,
            #     bet.amount,
            #     r,
            #     app_id=Application(self.payout_model),
            # )
            #########################################################
            # Update balance tracking
            #   Release locked balance and adjust available balance
            max_possible_payout = bet.amount.native * UInt64(MAX_PAYOUT_MULTIPLIER)
            self.balance_locked -= max_possible_payout
            self.balance_available += (
                max_possible_payout - payout.native
            )  # Release locked funds minus payout
            self.balance_total -= payout.native  # Reduce total balance by payout amount
            if payout > 0:
                itxn.Payment(receiver=bet.who.native, amount=payout.native).submit()
            del self.bet[bet_key]
            itxn.Payment(receiver=Txn.sender, amount=BOX_COST_BET).submit()
            arc4.emit(
                BetClaimed(
                    who=bet.who,
                    amount=bet.amount,
                    confirmed_round=bet.confirmed_round,
                    index=bet.index,
                    claim_round=bet.claim_round,
                    payout=payout,
                )
            )
            return payout.native


class YieldBearingToken(ARC200Token, Ownable, Upgradeable, Deleteable, Stakeable):
    """
    A simple yield bearing token
    """

    def __init__(self) -> None:
        # arc200 state
        self.name = String()
        self.symbol = String()
        self.decimals = UInt64()
        self.totalSupply = BigUInt()
        # ownable state
        self.owner = Global.creator_address
        # upgradeable state
        self.upgrader = Global.creator_address
        self.contract_version = UInt64()
        self.deployment_version = UInt64()
        self.updatable = bool(1)
        # deleteable state
        self.deletable = bool(1)
        # stakeable state
        self.delegate = Account()
        self.stakeable = bool(1)
        # yield bearing state
        self.bootstrap_active = bool()
        self.yield_bearing_source = UInt64()
        self.yield_fuse_active = bool(1)

    # guard methods

    @subroutine
    def only_owner(self) -> None:
        """
        Only callable by contract owner
        """
        assert Txn.sender == self.owner, "only owner can call this function"

    @arc4.abimethod
    def post_update(self) -> None:
        """
        Post upgrade
        """
        assert Txn.sender == self.upgrader, "must be upgrader"

    @arc4.abimethod
    def bootstrap(self) -> None:
        """
        Bootstrap the contract
        """
        self.only_owner()
        assert self.bootstrap_active == bool(), "bootstrap is not active"
        self.name = String("Voi Casino Demo")
        self.symbol = String("VCD")
        self.decimals = UInt64(9)
        self.totalSupply = BigUInt(0)
        self.bootstrap_active = True

    @arc4.abimethod
    def set_yield_bearing_source(self, app_id: arc4.UInt64) -> None:
        """
        Set the yield bearing source
        """
        self.only_owner()
        assert self.yield_fuse_active == bool(1), "yield fuse is not active"
        app = Application(app_id.native)
        owner, txn = arc4.abi_call(
            SlotMachine.get_owner,
            app_id=app,
        )
        assert (
            owner.native == Global.current_application_address
        ), "yield bearing source must be owned by this contract"
        self.yield_bearing_source = app_id.native

    @arc4.abimethod
    def revoke_yield_bearing_source(self, owner: arc4.Address) -> None:
        """
        Revoke the yield bearing source by transferring ownership to a new owner
        """
        self.only_owner()
        assert self.yield_bearing_source > 0, "yield bearing source not set"
        arc4.abi_call(
            Ownable.transfer,
            owner,
            app_id=Application(self.yield_bearing_source),
        )

    @arc4.abimethod
    def burn_yield_fuse(self) -> None:
        """
        Burn the yield fuse
        """
        self.only_owner()
        assert self.yield_fuse_active == bool(1), "yield fuse is not active"
        self.yield_fuse_active = False

    @arc4.abimethod
    def burn_stakeable_fuse(self) -> None:
        """
        Burn the stakeable fuse
        """
        self.only_owner()
        self.stakeable = False

    @arc4.abimethod
    def burn_deletable_fuse(self) -> None:
        """
        Burn the deletable fuse
        """
        self.only_owner()
        self.deletable = False

    @arc4.abimethod
    def burn_upgradeable_fuse(self) -> None:
        """
        Burn the upgradeable fuse
        """
        self.only_owner()
        self.updatable = False

    @subroutine
    def _get_yield_bearing_source_balance(self) -> UInt64:
        """
        Get the balance of the yield bearing source
        """
        available_balance, txn = arc4.abi_call(
            SlotMachineInterface.get_balance_available,
            app_id=Application(self.yield_bearing_source),
        )
        return available_balance.native

    @arc4.abimethod
    def deposit(self) -> arc4.UInt256:
        """
        Deposit funds into the contract

        Args:
            amount: Amount of funds to deposit
        Returns:
            The number of shares minted
        """
        # Validate inputs
        assert self.yield_bearing_source > 0, "yield bearing source not set"

        # Check payment
        payment = require_payment(Txn.sender)
        assert payment > BOX_COST_BALANCE, "payment insufficient"
        deposit_amount = (
            payment if self._balanceOf(Txn.sender) > 0 else payment - BOX_COST_BALANCE
        )
        assert (
            deposit_amount > 0
        ), "deposit amount must be greater than 0"  # impossible because of assert above

        # Forward to yield source
        app = Application(self.yield_bearing_source)
        itxn.Payment(receiver=app.address, amount=deposit_amount).submit()
        # Call owner_deposit (ensure this contract is owner)
        arc4.abi_call(
            SlotMachine.owner_deposit,
            arc4.UInt64(deposit_amount),
            app_id=app,
        )

        # Mint shares
        return arc4.UInt256(self._mint(BigUInt(deposit_amount)))

    @subroutine
    def _mint(self, amount: BigUInt) -> BigUInt:
        """
        Mint tokens (shares) based on the proportion of assets being deposited

        Args:
            amount: The amount of assets being deposited
        Returns:
            BigUInt: The number of shares minted
        Raises:
            AssertionError: If deposit would result in 0 shares
        """
        total_assets = BigUInt(self._get_yield_bearing_source_balance())

        if self.totalSupply == 0:
            shares = amount
        else:
            shares = (amount * self.totalSupply) // total_assets

        # Ensure minimum shares are minted to prevent dust deposits
        assert shares > 0, "Deposit amount too small"
        self.totalSupply += shares
        self.balances[Txn.sender] = self._balanceOf(Txn.sender) + shares
        arc4.emit(
            arc200_Transfer(
                arc4.Address(Global.zero_address),
                arc4.Address(Txn.sender),
                arc4.UInt256(shares),
            )
        )
        return shares

    @arc4.abimethod
    def withdraw(self, amount: arc4.UInt256) -> arc4.UInt64:
        """
        Withdraw funds from the contract
        """
        assert amount.native > 0, "amount must be greater than 0"
        assert self.yield_bearing_source > 0, "yield bearing source not set"
        assert self._balanceOf(Txn.sender) >= amount.native, "insufficient balance"
        return arc4.UInt64(self._burn(amount.native))

    @subroutine
    def _burn(self, withdraw_amount: BigUInt) -> UInt64:
        """
        Burn tokens (shares) based on the proportion of assets being withdrawn
        """
        # Calculate withdrawal amount with increased precision
        slot_machine_balance, txn = arc4.abi_call(
            SlotMachineInterface.get_balance_available,
            app_id=Application(self.yield_bearing_source),
        )
        big_slot_machine_balance = BigUInt(slot_machine_balance.native)

        amount_to_withdraw = (
            (withdraw_amount * big_slot_machine_balance * SCALING_FACTOR)
            // self.totalSupply
        ) // SCALING_FACTOR

        # Verify amount conversion
        small_amount_to_withdraw = arc4.UInt64.from_bytes(
            arc4.UInt256(amount_to_withdraw).bytes[-8:]
        ).native
        assert small_amount_to_withdraw > 0, "amount to withdraw is 0"
        assert (
            small_amount_to_withdraw <= slot_machine_balance.native
        ), "amount to withdraw exceeds available balance"

        # Update balances first
        self.balances[Txn.sender] -= withdraw_amount
        self.totalSupply -= withdraw_amount

        # Make external calls after state updates
        app = Application(self.yield_bearing_source)
        arc4.abi_call(
            SlotMachine.withdraw,
            amount_to_withdraw,
            app_id=app,
        )
        itxn.Payment(receiver=Txn.sender, amount=small_amount_to_withdraw).submit()

        # Emit event
        arc4.emit(
            arc200_Transfer(
                arc4.Address(Txn.sender),
                arc4.Address(Global.zero_address),
                arc4.UInt256(withdraw_amount),
            )
        )
        return small_amount_to_withdraw
