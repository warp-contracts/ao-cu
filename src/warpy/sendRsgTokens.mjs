import { backOff } from 'exponential-backoff';
import { defaultCacheOptions, WarpFactory } from 'warp-contracts';

const dreWarpyUrl = `https://dre-warpy.warp.cc`;
const apiWarpyUrl = `https://api-warpy.warp.cc`;

export async function sendRsgTokens(rsg) {
  const request = async () => {
    if (!rsg.recipients) {
      console.log(`no recipients found`, rsg);
      return;
    }
    const addresses = Object.keys(rsg.recipients);

    if (addresses.length == 0) {
      console.log('no recipients found in the external tokens map');
      return;
    }

    console.log('found new Warpy external tokens recipients', addresses);

    try {
      const usersIds = await getWarpyUsersIds(addresses);
      if (!usersIds) {
        console.log(`could not get Warpy external tokens user ids`);
        return;
      }
      console.log(`users ids assigned to the recipients of Warpy external tokens`, usersIds);

      const ids = Object.keys(usersIds).map((a) => usersIds[a.toLowerCase()]);
      if (ids.length == 0) {
        console.log('none of the recipients is registered in Warpy, leaving');
        return;
      }

      const usersRoles = await getWarpyUsersRoles(ids);
      console.log(`users roles assigned to the Warpy ids`, usersRoles);

      const addressToRoles = mapAddressToRoles(addresses, usersIds, usersRoles);
      console.log(`users roles assigned to the Warpy external tokens recipients`, addressToRoles);

      const response = await writeInteractionToWarpy(rsg, addressToRoles);
      console.log(`interaction sent to Warpy`, response?.originalTxId);
    } catch (e) {
      console.error('error while sending Warpy external tokens', e);
      return Promise.reject(e);
    }
  };

  try {
    await backOff(request, {
      delayFirstAttempt: false,
      maxDelay: 2000,
      numOfAttempts: 5,
    });
  } catch (error) {
    throw new Error(`unable to send Warpy external tokens. ${error}`);
  }
}

async function getWarpyUsersIds(addresses) {
  return (
    await fetch(`${dreWarpyUrl}/warpy/fixed/user-ids`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json',
      },
      body: JSON.stringify({ addresses }),
    }).then((res) => res.json())
  )?.['wallet_to_id'];
}

async function getWarpyUsersRoles(ids) {
  return (
    await fetch(`${apiWarpyUrl}/v1/usersRoles?ids=${ids}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json',
      },
      body: JSON.stringify({ ids }),
    }).then((res) => res.json())
  )?.['id_to_roles'];
}

function mapAddressToRoles(addresses, usersIds, usersRoles) {
  const addressToRoles = {};
  for (let address of addresses) {
    const userId = usersIds[address.toLowerCase()];
    if (userId) {
      addressToRoles[address] = usersRoles[userId];
    } else {
      continue;
    }
  }

  return addressToRoles;
}

async function writeInteractionToWarpy(rsg, addressToRoles) {
  const warp = WarpFactory.forMainnet({ ...defaultCacheOptions, inMemory: true });
  const contract = warp
    .contract(rsg.id)
    .setEvaluationOptions({
      sequencerUrl: 'https://gw.warp.cc/',
    })
    .connect(JSON.parse(process.env.NODE_JWK_KEY));

  const members = Object.entries(addressToRoles).map(([address, roles]) => {
    return {
      id: address,
      roles: roles || [],
      points: rsg.recipients[`jmGGoJaDYDTx4OCM7MP-7l-VLIM4ZEGCS0cHPsSmiNE`],
      // rsg.recipients[Object.keys(rsg.recipients).find((r) => r.toLowerCase() == address.toLowerCase())] || 0,
    };
  });

  const addPointsInput = {
    function: 'addPointsForAddress',
    adminId: '769844280767807520',
    members,
    noBoost: false,
    points: 0,
  };
  console.log(`writing interaction to Warpy..., ${JSON.stringify(addPointsInput)}`);
  return await contract.writeInteraction(addPointsInput);
}
