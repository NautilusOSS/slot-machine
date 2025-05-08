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
)
from opensubmarine import Upgradeable, Stakeable, ARC200Token, arc200_Transfer
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

BOX_COST_BET = 37700  # 37700 microVOI
MAX_RANDOM_NUMBER = 1000000000  # 1 billion
MAX_EXTRA_PAYMENT = 1000000  # 1 VOI
MAX_PAYOUT_MULTIPLIER = 100  # 100x
ROUND_FUTURE_DELTA = 1  # 1 round in the future
MAX_CLAIM_ROUND_DELTA = 1000  # 1000 rounds in the future
MIN_BET_AMOUNT = 1000000  # 1 VOI
MAX_BET_AMOUNT = 1000000000  # 1000 VOI

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
    def set_payout_model(self, multipliers: arc4.StaticArray[arc4.UInt64, typing.Literal[6]], probabilities: arc4.StaticArray[arc4.UInt64, typing.Literal[6]]) -> None:
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


    # guard methods

    @subroutine
    def only_owner(self) -> None:
        """
        Only callable by contract owner
        """
        assert Txn.sender == self.owner, "only owner can call this function"

    # setter methods

    @arc4.abimethod
    def set_payout_model(self, multipliers: arc4.StaticArray[arc4.UInt64, typing.Literal[6]], probabilities: arc4.StaticArray[arc4.UInt64, typing.Literal[6]]) -> None:
        """
        Set the payout model
        """
        self.only_owner()
        self.payout_model = PayoutModel(multipliers=multipliers.copy(), probabilities=probabilities.copy())
        arc4.emit(ModelUpdated(old_model=self.payout_model, new_model=self.payout_model))

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
        # multipliers = arc4.StaticArray(
        #     arc4.UInt64(100),  # 100x
        #     arc4.UInt64(50),  # 50x
        #     arc4.UInt64(20),  # 20x
        #     arc4.UInt64(10),  # 10x
        #     arc4.UInt64(5),  # 5x
        #     arc4.UInt64(2),  # 2x
        # )
        # probabilities = arc4.StaticArray(
        #     arc4.UInt64(82_758),  # ~0.00008275862069
        #     arc4.UInt64(1_655_172),  # ~0.001655172414
        #     arc4.UInt64(8_275_862),  # ~0.008275862069
        #     arc4.UInt64(16_551_724),  # ~0.01655172414
        #     arc4.UInt64(41_379_310),  # ~0.04137931034
        #     arc4.UInt64(165_517_241),  # ~0.1655172414
        # )
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
    def spin(self, bet_amount: arc4.UInt64, index: arc4.UInt64) -> Bytes56:
        """
        Spin the slot machine. Outcome is determined by the seed
        of future round.

        Args:
            bet (uint): The player's wager.
            index (uint): Player's choice of index.

        Returns:
            r (uint): The round number of the spin.
        """
        return Bytes56.from_bytes(self._spin(bet_amount.native, index.native))

    @subroutine
    def _spin(self, bet_amount: UInt64, index: UInt64) -> Bytes:
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


class SlotMachine(SlotMachineInterface, Upgradeable, Stakeable, Deleteable):
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
    def post_upgrade(self) -> None:
        """
        Called after upgrade
        """
        assert Txn.sender == self.upgrader, "must be upgrader"
        self.contract_version = UInt64()
        self.deployment_version = UInt64()

    # owner methods

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

    # @arc4.abimethod
    # def spin(
    #     self,
    #     bet_amount: arc4.UInt64,
    #     index: arc4.UInt64,
    # ) -> Bytes56:
    #     """
    #     Spin the slot machine. Outcome is determined by the seed
    #     of future round.

    #     Args:
    #         bet (uint): The player's wager.
    #         index (uint): Player's choice of index.

    #     Returns:
    #         r (uint): The round number of the spin.
    #     """
    #     return Bytes56.from_bytes(self._spin(bet_amount.native, index.native))

    # override
    @subroutine
    def _spin(self, bet_amount: UInt64, index: UInt64) -> Bytes:
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
        # Update balance tracking
        #   Add bet amount to total balance
        self.balance_total += bet_amount
        self.balance_available += bet_amount  # Add bet amount to available first
        max_possible_payout = bet_amount * UInt64(MAX_PAYOUT_MULTIPLIER)
        self.balance_locked += max_possible_payout
        self.balance_available -= max_possible_payout
        # Create bet
        round = Global.round
        bet_key = self._get_bet_key(Txn.sender, bet_amount, round, index)
        assert bet_key not in self.bet, "bet already exists"
        claim_round = round + ROUND_FUTURE_DELTA
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

    # @arc4.abimethod
    # def claim(self, bet_key: Bytes56) -> arc4.UInt64:
    #     """
    #     Claim a bet

    #     Args:
    #         bet_key: The key of the bet to claim

    #     Returns:
    #         payout: The payout for the bet
    #     """
    #     return arc4.UInt64(self._claim(bet_key.bytes))

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
            # payout = ar4.ab self._calculate_bet_payout(bet.amount.native, r)
            payout, txn = arc4.abi_call(
                SlotMachinePayoutModelInterface.get_payout,
                bet.amount,
                r,
                app_id=Application(self.payout_model),
            )
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


# class YieldBearingToken(ARC200Token, Upgradeable, Deleteable, Stakeable):
#     """
#     A simple yield bearing token
#     """

#     def __init__(self) -> None:
#         # arc200 state
#         self.name = String()
#         self.symbol = String()
#         self.decimals = UInt64()
#         self.totalSupply = BigUInt()
#         # ownable state
#         self.owner = Global.creator_address
#         # upgradeable state
#         self.upgrader = Global.creator_address
#         self.contract_version = UInt64()
#         self.deployment_version = UInt64()
#         self.updatable = bool(1)
#         # deleteable state
#         self.deletable = bool(1)
#         # stakeable state
#         self.delegate = Account()
#         self.stakeable = bool(1)
#         # yield bearing state
#         self.yield_bearing_source = UInt64()

#     # owner methods

#     @arc4.abimethod
#     def set_yield_bearing_source(self, app_id: arc4.UInt64) -> None:
#         """
#         Set the yield bearing source
#         """
#         self.only_owner()
#         self.yield_bearing_source = app_id.native

#     @arc4.abimethod
#     def deposit(self, amount: arc4.UInt64) -> arc4.UInt256:
#         """
#         Deposit funds into the contract
#         """
#         return arc4.UInt256(self._deposit(amount.native))

#     @subroutine
#     def _deposit(self, amount: UInt64) -> BigUInt:
#         """
#         Deposit funds into the contract
#         """
#         assert amount > 0, "amount must be greater than 0"
#         payment = require_payment(Txn.sender)
#         required_payment = amount + 28500 if Txn.sender in self.balances else amount
#         assert payment >= required_payment, "payment insufficient"
#         bigAmount = BigUInt(amount)
#         return self._mint(bigAmount)

#     @subroutine
#     def _get_yield_bearing_source_balance(self) -> UInt64:
#         """
#         Get the balance of the yield bearing source
#         """
#         available_balance, txn = arc4.abi_call(
#             SlotMachineInterface.get_balance_available,
#             app_id=Application(self.yield_bearing_source),
#         )
#         return available_balance


#     @subroutine
#     def _mint(self, amount: BigUInt) -> BigUInt:
#         """
#         Mint tokens
#         """
#         shares = amount if self.totalSupply == 0 else amount * self.totalSupply / self.balance[Global.creator_address]
